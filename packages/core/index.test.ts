import { incremental, digest, consume } from ".";

const stream = incremental({
  foo: 1,
  bar: () => 2,
  gen: function*() {
    yield 11;
    yield 22;
  },
  seq: async function*() {
    yield 1;
    yield 2;
    await Promise.resolve();
    yield {
      foo: 1,
      bar: () => Promise.resolve(2)
    }
  },
  baz: {
     g: 1,
     h: () => Promise.resolve({
       foobar: 1,
       blub: Promise.resolve(3)
     })
  }
}, () => true, [])

describe("incremental", () => {
  it("should process all entries", async () => {
    const result = await consume(digest(stream));
    expect(result).toEqual({
      foo: 1,
      bar: 2,
      gen: [11, 22],
      seq: [1, 2, {
        foo: 1,
        bar: 2
      }],
      baz: {
        g: 1,
        h: {
          foobar: 1,
          blub: 3
        }
      }
    });
  })
})