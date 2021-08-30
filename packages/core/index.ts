import update from "lodash.update";
import {EventIterator} from "event-iterator";

type MaybePromise = {then?: Function}
type MaybeIterator = {
  [Symbol.iterator]?: Function
  [Symbol.asyncIterator]?: Function
}

const isFunction = <T>(obj: T) => typeof obj === 'function';
const isPromise = (obj: MaybePromise) => isFunction(obj?.then);
const isAsyncIterator = (obj: MaybeIterator) =>  obj && (obj[Symbol.iterator] || obj[Symbol.asyncIterator])

const isValue = <T>(obj: T) => !isFunction(obj) && !isPromise(obj) && !isAsyncIterator(obj)

const callMaybe = <T>(obj: T) => (typeof obj === 'function')? obj() : obj;

const toArray = <K, T>(entries: Array<[K, T]>) => entries.map(x => x[1]);
const toObject = <K,T>(entries: Array<[K, T]>) => Object.fromEntries(entries.filter(x=>x[1]));

export type Path = (string|number)[]
export type PatchMethod = "replace" | "append"

type ObjectLike = { [s: string]: unknown; } | ArrayLike<unknown>

export type Patch = {
  path?: Path
  method?: PatchMethod
  incomplete?: number
  data: object | Array<object>
}

export const patchObject = (obj: object, {path, data, method}: Patch) => {
  const p = (path||[]).join('.');
  if (p === "") {
    return data;
  } else if (method == "append") {
    return update(obj, p, (x: Array<object>) => [
      ...(x||[]), 
      ...(data as Array<object>)
    ]);
  } else {
    return update(obj, p, () => data);
  }
}



export type Picker = (path: Path) => boolean

export type DeferFunc = (path: Path, result: unknown) => void


export function slice(obj: ObjectLike | Iterable<unknown>, path: Path = [], pick: Picker, defer: DeferFunc): ObjectLike {
  if (typeof obj === "object") {
    const combine = (Array.isArray(obj)) ? toArray : toObject;
    return combine(
      Object
        .entries(obj)
        .filter( ([k]) => pick([...path, k]) )
        .map( ([k, v]) => {
          const result = callMaybe(v);
          const p = [...path, k];
          if (!isValue(result)) {
            defer(p, result);
            return {key: k, val: null}
          }

          return {key: k, val: slice(result, p, pick, defer)}
        })
        .filter(x=>x.val)
        .map(x => [x.key, x.val])
    );
  } else {
    return obj;
  }
}

export type IncrementalTask = {
  path: Path
  task: unknown
}

export type IncrementalResult = {
  complete: Patch;
  todo: IncrementalTask[]
}

export function incremental(obj: unknown, pick: Picker = () => true, path: Path = []): IncrementalResult {
  const p = callMaybe(obj);
  if (isPromise(p)) {
    return p.then((x: unknown) => incremental(x, pick, path))
  } else {
    const todo = [] as IncrementalTask[];
    const data = slice(p, path, pick, (path, task) => todo.push({
      path, 
      task
    }));

    return {
      complete: {
        path,
        incomplete: todo.length,
        data
      },
      todo
    };
  }
}

// Here be dragons
// TODO: expose cancelation token (queue.stop)
export function patchStream(tasks: IncrementalTask[], pick: Picker) {
  const stream = new EventIterator<Patch>(queue => {
    async function loop(tasks: IncrementalTask[]) {
      await Promise.all(tasks.map(async ({path, task}) => {
        const obj = await callMaybe(task);
        if (isAsyncIterator(obj)) {
          // process asyncItems one by one and emit in same order on completion
          // different strategy would be to emit patches to incomplete items.
          for await (const item of obj) {
            const {complete, todo} = await incremental(item, pick, path);
            let { data } = complete;
            // create sub-stream and patch item
            for await (const patch of patchStream(todo, pick)) {
              data = patchObject(data, {
                ...patch,
                path: (patch?.path||[]).slice(path.length)
              })
            }

            queue.push({
              ...complete,
              method: "append",
              incomplete: 0,
              data: [data]
            });
          }
        } else {
          const {complete, todo} = await incremental(obj, pick, path);
          queue.push(complete);
          return loop(todo);
        }
      }));
    };
  
    loop(tasks).finally(()=>{
      queue.stop();
    });
  });

  return stream;
}


export async function* digest(result: IncrementalResult, pick: Picker = () => true) {
  const {complete, todo} = await result;
  yield complete;
  for await (const item of patchStream(todo, pick)) {
    yield item;
  }
}


export async function consume(stream: AsyncGenerator<Patch>) {
  let obj = {};
  for await (const patch of stream) {
    obj = patchObject(obj, patch);
  }

  return obj;
}