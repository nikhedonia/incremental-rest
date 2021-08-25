# Incremental JSON

**Idea**: Leverage http/1.1 chunked responses to send partial json and re-assemble result clientside.

**Outcome**: partial results can be rendered clientside

## Approach:

server sends a sequence of patches of the shape:  
`{data: 1, path: "foo"}`, 
`{data: {nested: {baz: 2} }, path: "bar"}`
`{data: {deep: 42}, path: "bar.nested"}`

which then get composed to: 
- partial: `{foo: 1}`
- partial: `{foo: 1, bar: {nested: {baz: 2}}}`
- done: `{foo: 1, bar: {nested: {baz:2, deep: 42}}}`


## serverside engine:

- recursively traverse object where fields can be values and async function, call functions and await if needed.
- stream partial results as soon as available


## Code

- server:
  - pages/api/hello
- client: 
  - pages/index.jsx


## How to run

```bash
npm run dev
# or
yarn dev
```
