import { facetFilter } from './algolia-search.service';

describe('facetFilter', () => {
  it('quotes a plain value', () => {
    expect(facetFilter('shopId', 'abc123')).toBe('shopId:"abc123"');
  });

  it('keeps a value containing filter syntax inside a single quoted string', () => {
    // Without escaping, this would parse as: shopId:"x" OR shopId:"y"
    expect(facetFilter('shopId', 'x" OR shopId:"y')).toBe('shopId:"x\\" OR shopId:\\"y"');
  });

  it('escapes backslashes so they cannot swallow the closing quote', () => {
    expect(facetFilter('town', 'a\\')).toBe('town:"a\\\\"');
  });

  it('works for values with spaces', () => {
    expect(facetFilter('town', 'Tiruchirappalli East')).toBe('town:"Tiruchirappalli East"');
  });
});
