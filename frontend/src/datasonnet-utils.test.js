import { describe, expect, it } from 'vitest';
import { jsonPathAt, keySegment, parseJsonWithPositions, parseReference, resolveReference } from './datasonnet-utils.js';

const PAYLOAD = `{
  "persons": [
    { "id": 1, "name": "Jan", "adres": { "plaats": "Utrecht" } },
    { "id": 2, "name": "Piet", "my-key": true }
  ],
  "local": null,
  "leeg": {},
  "lijst": []
}`;

const pathAt = (marker, shift = 1) => jsonPathAt(parseJsonWithPositions(PAYLOAD), PAYLOAD.indexOf(marker) + shift);
const text = (source, nodes) => nodes.map(node => source.slice(node.rangeStart, node.end));

describe('parseJsonWithPositions', () => {
  it('records offsets for objects, arrays and values', () => {
    const root = parseJsonWithPositions('{"a": [1, "x"], "b": null}');
    expect(root.type).toBe('object');
    expect(root.entries.map(entry => entry.key)).toEqual(['a', 'b']);
    const a = root.entries[0].node;
    expect(a.type).toBe('array');
    expect(a.items.map(item => item.type)).toEqual(['value', 'value']);
  });

  it('includes the key in the range of an entry', () => {
    const source = '{ "a": 12 }';
    const entry = parseJsonWithPositions(source).entries[0];
    expect(source.slice(entry.node.rangeStart, entry.node.end)).toBe('"a": 12');
  });

  it('parses scalars, negative and exponent numbers, and escapes in strings', () => {
    const root = parseJsonWithPositions('{"n": -1.5e3, "t": true, "s": "a\\"b", "k\\u0041": 1}');
    expect(root.entries.map(entry => entry.key)).toEqual(['n', 't', 's', 'kA']);
  });

  it('accepts empty objects and arrays', () => {
    expect(parseJsonWithPositions('{}').entries).toEqual([]);
    expect(parseJsonWithPositions(' [ ] ').items).toEqual([]);
  });

  it.each(['{"a": }', '{"a" 1}', '{a: 1}', '[1 2]', '{"a": 1} x', '"open', ''])('rejects invalid JSON %j', source => {
    expect(() => parseJsonWithPositions(source)).toThrow();
  });
});

describe('keySegment', () => {
  it.each([
    ['name', '.name'],
    ['_x1', '._x1'],
    ['my-key', '["my-key"]'],
    ['1abc', '["1abc"]'],
    ['local', '["local"]'],
    ['if', '["if"]'],
    ['a b', '["a b"]']
  ])('writes %s as %s', (key, expected) => {
    expect(keySegment(key)).toBe(expected);
  });
});

describe('jsonPathAt', () => {
  it('gives the path of a value', () => {
    expect(pathAt('"Piet"')).toBe('payload.persons[1].name');
    expect(pathAt('Utrecht')).toBe('payload.persons[0].adres.plaats');
  });

  it('uses brackets for keys that are not valid names or are reserved', () => {
    expect(pathAt('true')).toBe('payload.persons[1]["my-key"]');
    expect(pathAt('null')).toBe('payload["local"]');
  });

  it('gives the path of a key', () => {
    expect(pathAt('"id": 1')).toBe('payload.persons[0].id');
  });

  it('gives the path of an array or object itself', () => {
    expect(pathAt('[\n    {')).toBe('payload.persons');
    expect(pathAt('"lijst"', 1)).toBe('payload.lijst');
  });

  it('gives "payload" for the root', () => {
    expect(jsonPathAt(parseJsonWithPositions(PAYLOAD), 0)).toBe('payload');
  });
});

describe('parseReference', () => {
  it('splits a root and its segments', () => {
    const reference = parseReference('payload.persons[0]["my-key"]');
    expect(reference.root).toBe('payload');
    expect(reference.segments.map(({ end, ...segment }) => segment)).toEqual([
      { key: 'persons' }, { index: 0 }, { key: 'my-key' }
    ]);
  });

  it('supports negative indexes, single quotes and spaces around dots', () => {
    const reference = parseReference("p [ -1 ] . a['b\\'c']");
    expect(reference.segments.map(({ end, ...segment }) => segment)).toEqual([
      { index: -1 }, { key: 'a' }, { key: "b'c" }
    ]);
  });

  it('records where each segment ends', () => {
    const reference = parseReference('a.b.c');
    expect(reference.segments.map(segment => segment.end)).toEqual([3, 5]);
  });
});

describe('resolveReference', () => {
  const payload = parseJsonWithPositions(PAYLOAD);
  const resolve = (script, ref, params = []) =>
    resolveReference(script, parseReference(ref), script.indexOf(ref), () => payload, params);

  it('resolves payload paths', () => {
    expect(text(PAYLOAD, resolve('x', 'payload.persons[1].name').nodes)).toEqual(['"name": "Piet"']);
    expect(text(PAYLOAD, resolve('x', 'payload["local"]').nodes)).toEqual(['"local": null']);
    expect(text(PAYLOAD, resolve('x', 'payload.persons[-1]["my-key"]').nodes)).toEqual(['"my-key": true']);
  });

  it('returns no nodes for a path that does not exist', () => {
    expect(resolve('x', 'payload.nope').nodes).toEqual([]);
    expect(resolve('x', 'payload.persons[9]').nodes).toEqual([]);
    expect(resolve('x', 'payload.local.x').nodes).toEqual([]);
  });

  it('resolves a parameter by name', () => {
    expect(resolve('x', 'greeting', ['greeting'])).toEqual({ param: 'greeting' });
    expect(resolve('x', 'greeting.sub', ['greeting'])).toEqual({ param: 'greeting' });
  });

  it('follows a for-loop variable to every item', () => {
    const script = '[ p.name for p in payload.persons ]';
    expect(text(PAYLOAD, resolve(script, 'p.name').nodes)).toEqual(['"name": "Jan"', '"name": "Piet"']);
  });

  it('follows a local variable', () => {
    const script = 'local first = payload.persons[0];\n{ plaats: first.adres.plaats }';
    expect(text(PAYLOAD, resolve(script, 'first.adres.plaats').nodes)).toEqual(['"plaats": "Utrecht"']);
  });

  it('follows chained variables', () => {
    const script = 'local a = payload.persons;\nlocal b = a[1];\nb.name';
    expect(text(PAYLOAD, resolve(script, 'b.name').nodes)).toEqual(['"name": "Piet"']);
  });

  it('follows a variable that is defined from a parameter', () => {
    const script = 'local g = greeting;\ng';
    expect(resolve(script, 'g', ['greeting'])).toEqual({ param: 'greeting' });
  });

  it('prefers the nearest earlier definition of a reused name', () => {
    const script = '[ p.id for p in payload.persons ]\n[ p.plaats for p in [payload.persons[0].adres] ]';
    expect(resolve(script, 'p.id').nodes).toHaveLength(2);
  });

  it('throws for an unknown variable', () => {
    expect(() => resolve('x', 'q.name')).toThrow('"q" is geen payload, parameter of herleidbare variabele');
  });

  it('throws instead of looping on variables that refer to each other', () => {
    const script = 'local a = b.x;\nlocal b = a.x;\na.x';
    expect(() => resolveReference(script, parseReference('a.x'), script.lastIndexOf('a.x'), () => payload, [])).toThrow('niet worden herleid');
  });

  it('does not loop on a variable that refers to itself', () => {
    expect(() => resolve('local a = a.x;\na.x', 'a.x')).toThrow();
  });

  it('only parses the payload when a reference needs it', () => {
    let parsed = 0;
    resolveReference('x', parseReference('greeting'), 0, () => { parsed++; return payload; }, ['greeting']);
    expect(parsed).toBe(0);
  });
});
