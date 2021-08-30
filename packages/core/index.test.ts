import { incremental, digest, consume } from ".";

const stream1 = incremental({
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
})

const stream2 = incremental({
  a: 1,
  b: () => ({
    c: 2,
    d: () => Promise.resolve(3),
    e: () => Promise.resolve(4) 
  }),
});

describe("incremental", () => {
  it("should process all entries", async () => {
    const result = await consume(digest(stream1));
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
  });


  it("should emit patches", async () => {
    const patches = [];
    for await (const patch of digest(stream2)) {
      patches.push(patch);
    }

    expect(patches).toMatchObject([{
      data: {
        a: 1,
        b: {
          c: 2
        }
      }
    }, {
      data: 3,
      path: ["b", "d"]
    }, {
      data: 4,
      path: ["b", "e"]
    }])
  })

})