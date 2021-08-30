import { useState, useEffect } from "react";
import { Patch, patchObject } from "@incremental/core";

export async function* responseToIncremental<T> (response: Response): AsyncGenerator<T> {
  if (!response?.body?.getReader) {
    return;
  }

  const reader = response.body.getReader();
  let result = {}
  //TODO: we should only execute this code if we have transfer-encoding = chunked && content-type = multipart 
  while (1) {
    // read one chunk
    let data = await reader.read();
    try {
      
      const chunks = new TextDecoder()
        .decode(data.value)
        .split("---")
        .map(x=>x.trim())
        .filter(x=>x!="");

      for (const str of chunks) {
        const patch = JSON.parse(str) as Patch;
        patchObject(result, patch);
        yield (result as T);
      }
    } catch (e) {
      return;
    }
    if (data.done) break;
  }
}

export function useIncrementalFetch <T>(url: string, deps: unknown[]) {
  const [state, setState] = useState<{
    data: T | null,
    done: boolean
  }>({data: null, done: false});

  useEffect(() => {
    (async () => {
      const fetched = fetch(url);
      const parts = await fetch(url).then(res=>responseToIncremental<T>(res));
      let lastPart: T | null = null;

      //TODO: debounce for better performance
      for await (const part of parts) {
        setState({data: part, done: false});
        lastPart = part;
      }
      setState({data: lastPart, done: true});
    })();
  }, deps)

  return state;
}


export type PatchStreamFactory = () => AsyncGenerator<Patch>

export function useIncrementalStream <T>(psf: PatchStreamFactory, deps: unknown[]) {
  const [state, setState] = useState<{
    data: T | null,
    done: boolean
  }>({data: null, done: false});

  useEffect(() => {
    (async () => {
      let result = {} as unknown as T;
      //TODO: debounce for better performance
      for await (const patch of psf()) {
        result = patchObject(result as {}, patch);
        setState({data: result, done: false});
      }
      setState({data: result, done: true});
    })();
  }, deps)

  return state;
}