// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'

const isFunction = obj => typeof obj === 'function';
const isPromise = obj => isFunction(obj?.then);
const callMaybe = o => isFunction(o)? o() : o;

const getAlternative = o => callMaybe(o?.alternative)

const withDefault = (p, alternative) => {
  p.alternative = alternative
  return p;
}

async function resolveIncrementalJson(write, obj, path = "") {
  const p = callMaybe(obj);
  const alt = getAlternative(p);
  
  if (alt) {
    // TODO: only stream alternative if p takes too long to resolve
    await write({data: alt, path});
  }

  const data = await p;
    
  const done = 
    Object.entries(data)
      .filter( ([k, obj]) => !isPromise(obj) && !isFunction(obj))

  if (done.length) {
    write({data: Object.fromEntries(done), path});
  }

  const todo = Object.entries(data)
    .filter( ([k, obj]) => isPromise(obj) || isFunction(obj))
    .map( ([k, obj]) => resolveIncrementalJson(write, obj, (path + "." + k).replace(/^\./,"")))

  await Promise.all(todo);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<unknown>
) {
  res.setHeader("content-type", "multipart/mixed");
  res.setHeader("transfer-encoding", "chunked");
  res.status(200)
  res.flushHeaders();

  // brittle workaround for endgecase where two patches end up in the same chunk 
  const separator = ":>";

  //TODO: return final result?
  //TODO: only write patches if supported by client
  await resolveIncrementalJson( 
    //TODO: batch/debounce res.write for performance
    (x: unknown) => res.write(separator + JSON.stringify(x)), 
    {
      instant: 1,
      nested: () => Promise.resolve(2),
      foo: () => withDefault(
        new Promise(done => setTimeout(done, 1000)).then(()=>({blub:1})), 
        () => ({blub: 42})
      ),
      bar: () => new Promise(done => setTimeout(done, 2000)).then(()=>({baz:1}))
  });

  res.end();
  
}
