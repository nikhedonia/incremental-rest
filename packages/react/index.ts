import {useState, useEffect} from "react";
export function useIncrementalJson(url, deps) {
    const [state, setState] = useState({data: undefined, done: false});
  
    useEffect(() => {
      (async () => {
        const parts = await fetch(url)
          .then(incrementalJson);
        let lastPart = null;
  
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