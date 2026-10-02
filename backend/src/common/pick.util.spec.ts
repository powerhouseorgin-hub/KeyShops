import { pick } from './pick.util';

describe('pick', () => {
  it('keeps only the listed keys', () => {
    const body: any = { name: 'Shop', themeColor: '#fff', isActive: false, referralPoints: 9999, categoryId: 'x' };
    expect(pick(body, ['name', 'themeColor'])).toEqual({ name: 'Shop', themeColor: '#fff' });
  });

  it('drops listed keys that are absent or undefined, but keeps null/false/0', () => {
    expect(pick({ a: undefined, b: null, c: 0, d: false } as any, ['a', 'b', 'c', 'd', 'e' as any])).toEqual({ b: null, c: 0, d: false });
  });

  it('ignores inherited properties and non-object input', () => {
    const proto = { inherited: 'x' };
    const obj = Object.create(proto);
    obj.own = 'y';
    expect(pick(obj, ['own', 'inherited'] as any)).toEqual({ own: 'y' });
    expect(pick(null, ['a'] as any)).toEqual({});
    expect(pick('str' as any, ['length'] as any)).toEqual({});
  });
});
