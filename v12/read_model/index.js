'use strict';

const TW=require('./tw_asset_snapshot.js');
const US=require('./us_asset_snapshot.js');
const Regional=require('./regional_context_snapshot.js');
const Home=require('./home_snapshot.js');

module.exports=Object.freeze({
  ...TW,
  ...US,
  ...Regional,
  ...Home,
});
