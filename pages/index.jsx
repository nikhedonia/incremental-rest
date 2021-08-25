import styles from '../styles/Home.module.css'
import { useEffect, useState } from 'react';
import update from 'lodash.update';

const incrementalJson = async function* (response) {
  const reader = response.body.getReader();
  let result = {}
  while(1) {
    let data = await reader.read();
    try {
      const chunks = new TextDecoder()
        .decode(data.value)
        .split(":>")
        .map(x=>x.trim())
        .filter(x=>x!="");
      for (const str of chunks) {
        console.log({str})
        const json = JSON.parse(str);
        const path = (json?.path || "");

        if (path != "") {
          update(result, path, () => json.data);
        } else { 
          result = json.data;
        }
        yield result;
      }
    } catch (e) {
      console.log(e);

      return;
    }
    if (data.done) break;
  }
}

function useIncrementalJson(url, deps) {
  const [state, setState] = useState({data: undefined, done: false});

  useEffect(() => {
    (async () => {
      const parts = await fetch(url).then(incrementalJson);
      let lastPart = null;
      for await (const part of parts) {
        setState({data: part, done: false});
        lastPart = part;
      }
      setState({data: lastPart, done: true});
    })();
  }, deps)

  return state;
}

const Home = () => {
  const data = useIncrementalJson("/api/hello", []);

  return (
    <div className={styles.container}>
      {JSON.stringify(data)}
    </div>
  )
}

export default Home
