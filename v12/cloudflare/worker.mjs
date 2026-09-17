import http from './http.cjs';
import refresh from './refresh.cjs';
export default {
 fetch(request,env){return http.handleRequest(request,env)},
 async scheduled(event,env){return refresh.runRefresh(env)}
};
