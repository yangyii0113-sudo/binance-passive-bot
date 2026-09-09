from __future__ import annotations

import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape

ASSET_TOKENS = {
    'BTC': ('BITCOIN',' BTC ','BTC/','BTC-'),
    'ETH': ('ETHEREUM',' ETH ','ETH/','ETH-'),
    'SOL': ('SOLANA',' SOL ','SOL/','SOL-'),
    'XRP': (' XRP ','RIPPLE'),
    'BNB': (' BNB ','BINANCE COIN'),
    'DOGE': ('DOGECOIN',' DOGE '),
    'LINK': ('CHAINLINK',' LINK '),
    'TAO': ('BITTENSOR',' TAO '),
}
HIGH = ('FOMC','FEDERAL RESERVE','RATE DECISION','INTEREST RATE','CPI','CONSUMER PRICE','NONFARM','PAYROLL','NFP','ETF','SEC','HACK','EXPLOIT','LIQUIDATION')
MACRO = ('FOMC','FEDERAL RESERVE','CPI','CONSUMER PRICE','NONFARM','PAYROLL','JOBS','INFLATION','INTEREST RATE','TREASURY','DOLLAR')
POLICY = ('SEC','CFTC','REGULATION','REGULATORY','LAW','COURT','ETF')


def _text(node, name):
    x = node.find(name)
    return (x.text or '').strip() if x is not None else ''


def _iso_date(raw: str):
    if not raw:
        return None
    try:
        d = parsedate_to_datetime(raw)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
    except Exception:
        try:
            d = datetime.fromisoformat(raw.replace('Z','+00:00'))
            if d.tzinfo is None: d=d.replace(tzinfo=timezone.utc)
            return d.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
        except Exception:
            return None


def classify_news(title: str, description: str='') -> dict:
    text = f' {title} {description} '.upper()
    impact = 'HIGH' if any(k in text for k in HIGH) else 'MEDIUM'
    tags=[]
    if any(k in text for k in MACRO): tags.append('MACRO')
    if any(k in text for k in POLICY): tags.append('POLICY')
    if any(k in text for k in ('HACK','EXPLOIT','OUTAGE')): tags.append('SECURITY')
    if any(k in text for k in ('ETF','INFLOW','OUTFLOW','FUND')): tags.append('FLOW')
    if not tags: tags.append('MARKET')
    assets=[]
    for sym,tokens in ASSET_TOKENS.items():
        if any(t in text for t in tokens): assets.append(sym)
    return {'impact':impact,'tags':tags,'assets':assets}


def parse_rss(payload: bytes, source_name: str, source_url: str) -> list[dict]:
    root=ET.fromstring(payload)
    items=[]
    for node in root.findall('.//item'):
        title=unescape(_text(node,'title'))
        link=_text(node,'link')
        desc=unescape(re.sub('<[^>]+>',' ',_text(node,'description'))).strip()
        pub=_iso_date(_text(node,'pubDate') or _text(node,'date'))
        c=classify_news(title,desc)
        if title and link:
            items.append({'title':title,'url':link,'summary':desc[:600],'published_at':pub,'source':source_name,'source_url':source_url,**c})
    if items: return items
    ns={'a':'http://www.w3.org/2005/Atom'}
    for node in root.findall('.//a:entry',ns):
        title=unescape(_text(node,'{http://www.w3.org/2005/Atom}title'))
        link_node=node.find('{http://www.w3.org/2005/Atom}link')
        link=link_node.attrib.get('href','') if link_node is not None else ''
        desc=unescape(re.sub('<[^>]+>',' ',_text(node,'{http://www.w3.org/2005/Atom}summary') or _text(node,'{http://www.w3.org/2005/Atom}content'))).strip()
        pub=_iso_date(_text(node,'{http://www.w3.org/2005/Atom}updated') or _text(node,'{http://www.w3.org/2005/Atom}published'))
        c=classify_news(title,desc)
        if title and link:
            items.append({'title':title,'url':link,'summary':desc[:600],'published_at':pub,'source':source_name,'source_url':source_url,**c})
    return items


def _unfold_ics(text: str) -> list[str]:
    out=[]
    for line in text.replace('\r\n','\n').split('\n'):
        if line.startswith((' ','\t')) and out:
            out[-1]+=line[1:]
        else:
            out.append(line)
    return out


def _ics_time(raw: str):
    raw=raw.strip()
    if raw.endswith('Z'):
        d=datetime.strptime(raw,'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
    elif 'T' in raw:
        d=datetime.strptime(raw,'%Y%m%dT%H%M%S').replace(tzinfo=timezone.utc)
    else:
        d=datetime.strptime(raw,'%Y%m%d').replace(tzinfo=timezone.utc)
    return d.isoformat().replace('+00:00','Z')


def parse_bls_ics(payload: bytes, now_ms: int | None=None) -> list[dict]:
    text=payload.decode('utf-8','replace')
    rows=[]; cur=None
    for line in _unfold_ics(text):
        if line=='BEGIN:VEVENT': cur={}
        elif line=='END:VEVENT':
            if cur and cur.get('DTSTART') and cur.get('SUMMARY'):
                try: when=_ics_time(cur['DTSTART'])
                except Exception: cur=None; continue
                title=cur['SUMMARY'].replace('\\,',',').replace('\\n',' ').strip()
                impact='EXTREME' if re.search(r'Consumer Price Index|Employment Situation|Producer Price Index|Employment Cost Index',title,re.I) else 'HIGH'
                rows.append({'time':when,'title':title,'description':cur.get('DESCRIPTION','').replace('\\n',' ')[:500],'source':'BLS','source_url':'https://www.bls.gov/schedule/news_release/bls.ics','status':'LIVE_SOURCE','impact':impact})
            cur=None
        elif cur is not None and ':' in line:
            k,v=line.split(':',1); k=k.split(';',1)[0]
            if k in ('DTSTART','SUMMARY','DESCRIPTION'): cur[k]=v
    rows.sort(key=lambda x:x['time'])
    return rows


def fetch_bytes(url: str, timeout: float=8.0) -> bytes:
    req=urllib.request.Request(url, headers={'User-Agent':'FOXYYA/11.2 paper-research runtime (+read-only feeds)'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(2_000_000)


def aggregate_news(feeds: list[tuple[str,str]], timeout: float=8.0, limit: int=40) -> dict:
    rows=[]; errors=[]; fetched=int(time.time()*1000)
    for name,url in feeds:
        try: rows.extend(parse_rss(fetch_bytes(url,timeout),name,url))
        except Exception as e: errors.append({'source':name,'url':url,'error':type(e).__name__+': '+str(e)[:180]})
    seen=set(); dedup=[]
    for r in sorted(rows,key=lambda x:x.get('published_at') or '',reverse=True):
        key=(r['title'].strip().lower(),r['url'])
        if key in seen: continue
        seen.add(key); dedup.append(r)
    return {'schema':'foxyya-news/1','status':'LIVE_SOURCE' if dedup and not errors else 'PARTIAL' if dedup else 'UNAVAILABLE','fetched_at':fetched,'items':dedup[:limit],'errors':errors}


def fetch_bls_calendar(timeout: float=8.0) -> dict:
    fetched=int(time.time()*1000); url='https://www.bls.gov/schedule/news_release/bls.ics'
    try:
        rows=parse_bls_ics(fetch_bytes(url,timeout),fetched)
        return {'schema':'foxyya-calendar/1','status':'LIVE_SOURCE' if rows else 'UNAVAILABLE','fetched_at':fetched,'source':'BLS','source_url':url,'events':rows}
    except Exception as e:
        return {'schema':'foxyya-calendar/1','status':'UNAVAILABLE','fetched_at':fetched,'source':'BLS','source_url':url,'events':[],'error':type(e).__name__+': '+str(e)[:180]}
