// cache.js
import NodeCache from "node-cache";

const cache = new NodeCache({
  stdTTL: 60 * 60 * 3,       
  checkperiod: 60 * 10,
  useClones: false
});

export default cache;
