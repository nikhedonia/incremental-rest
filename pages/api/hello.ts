// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'

const isPromise = obj => typeof obj?.then === 'function';
const isFunction = obj => typeof obj === 'function';
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
  res.setHeader("content-type", "multipart/mixed;boundary=path");
  res.setHeader("transfer-encoding", "chunked");
  res.status(200)
  res.flushHeaders();

  await resolveIncrementalJson( (x: unknown) => res.write(":>" + JSON.stringify(x)), {
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
