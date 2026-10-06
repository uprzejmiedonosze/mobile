import { patronem, PATRONEM_DEFAULT } from '../src/lib/sex';

describe('patronem (odmiana przez płeć)', () => {
  it('bierze formę z sexStrings backendu', () => {
    expect(patronem({ 'Patronką': 'Patronem' })).toBe('Patronem');
    expect(patronem({ 'Patronką': 'Patronką' })).toBe('Patronką');
  });
  it('brak sexStrings (starszy backend) → forma neutralna', () => {
    expect(patronem(undefined)).toBe(PATRONEM_DEFAULT);
    expect(patronem({})).toBe('Patronką(em)');
  });
});
