import '../styles/globals.css'
import type { AppProps } from 'next/app';
import update from "lodash.update";

const isFunction = obj => typeof obj === 'function';
const isPromise = obj => isFunction(obj?.then);
const isAsyncIterator = obj =>  obj && (obj[Symbol.iterator] || obj[Symbol.asyncIterator])
const isValue = obj => !isFunction(obj) && !isPromise(obj) && !isAsyncIterator(obj)
const callMaybe = o => isFunction(o)? o() : o;

const toArray = (entries) => entries.map(x => x[1]);
const toObject = (entries) => Object.fromEntries(entries.filter(x=>x[1]));

const patchObject = (obj, {path, data, mode}) => {
  const p = path.join('.');
  if (p === "") {
    return data;
  } else if (mode == "append") {
    console.log({data}, ' appending');
    return update(obj, p, (x) => [...(x||[]), ...(data||[])]);
  } else {
    return update(obj, p, () => data);
  }
}

function slice(obj, path=[], pick = () => true, defer = () => {}) {
  if (typeof obj === "object") {    
    const combine = (Array.isArray(obj)) ? toArray : toObject;

    return combine(
      Object
        .entries(obj)
        .filter( ([k]) => pick([...path, k].join(".")) )
        .map( ([k, v]) => {
          const result = callMaybe(v);
          const p = [...path, k];
          if (!isValue(result)) {
            defer(p, result);
            return [k, null];
          }

          return [k, slice(result, p, pick, defer)] 
        })
        .filter(x=>x[1])
    );
  } else {
    return obj;
  }
}

function incremental(obj, pick = () => true, path = [], mode = "replace") {
  const p = callMaybe(obj);
  if (isPromise(p)) {
    return p.then(x => incremental(x, pick, path))
  } else {
    const todo = [];
    const data = slice(p, path, pick, (p, f) => todo.push([p, f]));

    return {
      complete: {
        path,
        mode,
        data: mode === "append" ? [data] : data
      },
      todo
    };
  }
}

async function* digest(result, pick) {
  const {complete, todo} = await result;

  let jobs = todo.length;
  let completed = 0;
  
  let done = [];

  // used to suspend and resume async seq
  let notify = () => {};
  let wait = new Promise(done => notify = done);

  // actor that will investigate todos
  // find and await incomplete
  // find complete and notify
  async function run(tasks) {
    return await Promise.all(tasks.map(async ([path, f]) => {
      const obj = await callMaybe(f);
      if (isAsyncIterator(obj)) {
        ++completed;
        for await (const o of obj) {
          jobs += 1;
          const next = await incremental(o, pick, path, "append");
          done.push(next.complete);
          jobs += next.todo.length;
          notify();
          await run(next.todo);
        }
      } else {
        const next = await incremental(obj, pick, path);
        done.push(next.complete);
        notify();
        jobs += next.todo.length;
        await run(next.todo);
      }
    }));
  }

  // start digest process
  const p = run(todo);

  yield complete;
  while (completed < jobs) {
    // wait until sth. completes
    await wait;
    // reset lock
    wait = new Promise(done => notify = done);

    // save jobs before yielding
    // we can safely perform this because code runs single threaded
    // but we need to copy values because once we yield code will be suspended
    const toYield = [...done];
    console.log({toYield});
    done = [];
    completed += toYield.length;
    yield* toYield;
  }

  await p;
  console.log("stream complete")
}

const x = incremental({
  foo: 1,
  slow: () => new Promise(done => setTimeout(()=>done(44), 1000)),
  bar: () => 2,
  gen: function*() {
    yield 11;
    yield 22;
  },
  seq: async function*() {
    yield 1;
    yield 2;
    yield 3;
  },
  baz: {
     g: 1,
     h: () => Promise.resolve({
       foobar: 1,
       blub: Promise.resolve(3),
       bazbaz: () => Promise.resolve(2)
     })
  }
})

async function consume() {
  let obj = {};
  for await (const patch of digest(x)) {
    console.log(patch);
    obj = patchObject(obj, patch);
    console.log({patch}, obj);
    //res.write(path)
  }
}


consume();

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}


export default MyApp
