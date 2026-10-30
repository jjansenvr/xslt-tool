import { describe, expect, it } from 'vitest';
import { buildParamInsertion, getElementSourceRanges, getXPathAt } from './xml-utils.js';

const at = (source, marker, shift = 1) => getXPathAt(source, source.indexOf(marker) + shift);

describe('getXPathAt', () => {
  const source = `<persons>
  <person id="1"><name>Jan</name></person>
  <person id="2"><name>Piet</name></person>
  <meta><version>3</version></meta>
</persons>`;

  it('gives the root element', () => {
    expect(at(source, '<persons>')).toBe('/persons');
  });

  it('omits the index for unique elements', () => {
    expect(at(source, '<version>')).toBe('/persons/meta/version');
  });

  it('uses a unique attribute to tell repeated siblings apart', () => {
    expect(at(source, '<name>Piet')).toBe('/persons/person[@id="2"]/name');
    expect(at(source, '<name>Jan')).toBe('/persons/person[@id="1"]/name');
  });

  it('falls back to an index when no attribute is unique', () => {
    const repeated = '<list><item>a</item><item>b</item><item>c</item></list>';
    expect(at(repeated, '<item>b')).toBe('/list/item[2]');
  });

  it('does not use an attribute that not every sibling has', () => {
    const partial = '<list><item id="1"/><item/></list>';
    expect(at(partial, '<item/>')).toBe('/list/item[2]');
  });

  it('includes the attribute when the cursor is on it', () => {
    expect(at(source, 'id="2"')).toBe('/persons/person[@id="2"]/@id');
  });

  it('quotes attribute values that contain a double quote', () => {
    const quoted = `<list><item k='a"b'/><item k="c"/></list>`;
    expect(at(quoted, `k='a`)).toBe(`/list/item[@k='a"b']/@k`);
  });

  it('ignores tags inside comments and CDATA', () => {
    const tricky = '<root><!-- <fake/> --><a/><![CDATA[ <fake/> ]]><b/></root>';
    expect(at(tricky, '<b/>')).toBe('/root/b');
    expect(at(tricky, '<a/>')).toBe('/root/a');
  });

  it('handles self-closing elements and prefixes', () => {
    const prefixed = '<ns:root xmlns:ns="http://x"><ns:a/><ns:b/></ns:root>';
    expect(at(prefixed, '<ns:b/>')).toBe('/ns:root/ns:b');
  });

  it('returns the root path for a position outside any element', () => {
    expect(getXPathAt('<?xml version="1.0"?>\n<a/>', 2)).toBe('/');
  });
});

describe('getElementSourceRanges', () => {
  it('maps every element to its offsets in the source', () => {
    const source = '<a><b x="1"/><c>tekst</c></a>';
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    const ranges = getElementSourceRanges(source, doc);
    const slice = name => {
      const range = ranges.get(doc.getElementsByTagName(name)[0]);
      return source.slice(range.start, range.end);
    };
    expect(slice('a')).toBe(source);
    expect(slice('b')).toBe('<b x="1"/>');
    expect(slice('c')).toBe('<c>tekst</c>');
  });

  it('skips comments, processing instructions and CDATA', () => {
    const source = '<?xml version="1.0"?><a><!-- <b/> --><b/><![CDATA[<c/>]]></a>';
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    const ranges = getElementSourceRanges(source, doc);
    const range = ranges.get(doc.getElementsByTagName('b')[0]);
    expect(source.slice(range.start, range.end)).toBe('<b/>');
  });
});

describe('buildParamInsertion', () => {
  const apply = (source, name) => {
    const result = buildParamInsertion(source, name);
    return source.slice(0, result.index) + result.text + source.slice(result.index);
  };
  const NS = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';

  it('inserts after xsl:output, keeping its indentation', () => {
    const source = `<xsl:stylesheet version="3.0" ${NS}>\n  <xsl:output method="xml"/>\n  <xsl:template match="/"/>\n</xsl:stylesheet>`;
    expect(apply(source, 'greeting')).toBe(
      `<xsl:stylesheet version="3.0" ${NS}>\n  <xsl:output method="xml"/>\n    <xsl:param name="greeting"/>\n  <xsl:template match="/"/>\n</xsl:stylesheet>`
    );
  });

  it('inserts right after the root tag when there is no xsl:output', () => {
    const source = `<xsl:stylesheet version="3.0" ${NS}><xsl:template match="/"/></xsl:stylesheet>`;
    expect(apply(source, 'p')).toBe(
      `<xsl:stylesheet version="3.0" ${NS}>\n  <xsl:param name="p"/>\n<xsl:template match="/"/></xsl:stylesheet>`
    );
  });

  it('uses the prefix of the stylesheet namespace', () => {
    const source = '<x:transform version="3.0" xmlns:x="http://www.w3.org/1999/XSL/Transform"><x:output method="text"/></x:transform>';
    expect(apply(source, 'p')).toContain('<x:param name="p"/>');
  });

  it('works for a default-namespace stylesheet', () => {
    const source = '<stylesheet version="3.0" xmlns="http://www.w3.org/1999/XSL/Transform"><template match="/"/></stylesheet>';
    expect(apply(source, 'p')).toContain('<param name="p"/>');
  });

  it('reports a parameter that is already declared', () => {
    const source = `<xsl:stylesheet version="3.0" ${NS}><xsl:param name="p"/></xsl:stylesheet>`;
    expect(buildParamInsertion(source, 'p')).toEqual({ exists: true });
  });

  it('does not treat a parameter inside a template as global', () => {
    const source = `<xsl:stylesheet version="3.0" ${NS}><xsl:template name="t"><xsl:param name="p"/></xsl:template></xsl:stylesheet>`;
    expect(buildParamInsertion(source, 'p').exists).toBeUndefined();
  });

  it.each(['1abc', 'a b', '', 'a:b:c', '$x'])('rejects the invalid name "%s"', name => {
    expect(() => buildParamInsertion(`<xsl:stylesheet version="3.0" ${NS}/>`, name)).toThrow('geldige XML-naam');
  });

  it('accepts names with a prefix, dot and dash', () => {
    expect(() => buildParamInsertion(`<xsl:stylesheet version="3.0" ${NS}><xsl:template match="/"/></xsl:stylesheet>`, 'my-ns:p.1')).not.toThrow();
  });

  it('rejects a source that is not a stylesheet', () => {
    expect(() => buildParamInsertion('<root/>', 'p')).toThrow('stylesheet of transform');
    expect(() => buildParamInsertion('geen xml', 'p')).toThrow('stylesheet of transform');
  });
});
