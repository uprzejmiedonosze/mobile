import { EMBED_CSS, EMBED_SIDE_MARGIN, embedInjection } from '../src/lib/embedStyle';
import { ud } from '../src/theme';

describe('embedStyle (strony www w WebView jak ekrany natywne)', () => {
  it('tło = tło ekranów natywnych, marginesy = 16 px jak na ekranach natywnych', () => {
    expect(EMBED_CSS).toContain(ud.surfaceLow);
    expect(EMBED_SIDE_MARGIN).toBe(16);
    expect(EMBED_CSS).toMatch(/body\.embed \.mpr-layout \{[^}]*padding: 16px 16px calc\(5rem/);
  });

  it('zeruje podwójny margines i odstęp od nagłówka, a wszystko jest zakresowane do body.embed', () => {
    expect(EMBED_CSS).toMatch(/body\.embed \.ui-content \{[^}]*margin: 0 !important;[^}]*padding: 0 !important;[^}]*border: 0 !important;/); // border: klasa `dialog` daje białą ramkę 1em
    expect(EMBED_CSS).toMatch(/body\.embed \.mpr-article > :first-child \{ margin-top: 0 !important; \}/);
    // żaden selektor nie działa poza trybem embed (strona www bez ?embed zostaje nietknięta)
    for (const line of EMBED_CSS.split('\n')) {
      const selectors = line.slice(0, line.indexOf('{')).split(',').map((s) => s.trim());
      for (const s of selectors) expect(s).toMatch(/body\.embed/);
    }
  });

  it('dolny odstęp zostawia miejsce nad pływającym przyciskiem „Wesprzyj!”', () => {
    expect(EMBED_CSS).toContain('safe-area-inset-bottom');
  });

  it('skrypt wstrzykujący jest poprawnym JS, wkłada <style> i kończy się `true;`', () => {
    const js = embedInjection();
    expect(js.endsWith('true;')).toBe(true);
    expect(() => new Function(js)).not.toThrow();
    const created: any[] = [];
    const doc = {
      createElement: () => { const el: any = { attrs: {}, setAttribute(k: string, v: string) { this.attrs[k] = v; } }; created.push(el); return el; },
      head: { appendChild: jest.fn() },
      documentElement: { appendChild: jest.fn() },
    };
    new Function('document', js)(doc);
    expect(created[0].textContent).toBe(EMBED_CSS);
    expect(created[0].attrs['data-ud-embed']).toBe('1');
    expect(doc.head.appendChild).toHaveBeenCalledWith(created[0]);
  });

  it('działa też, gdy <head> jeszcze nie istnieje (before-content-loaded)', () => {
    const doc: any = {
      createElement: () => ({ setAttribute() {} }),
      head: null,
      documentElement: { appendChild: jest.fn() },
    };
    new Function('document', embedInjection())(doc);
    expect(doc.documentElement.appendChild).toHaveBeenCalledTimes(1);
  });

  it('css w skrypcie jest bezpiecznie zakodowany (cudzysłowy, nowe linie)', () => {
    const js = embedInjection('a{content:"x\'y"}\nb{}');
    const doc: any = { createElement: () => ({ setAttribute() {} }), head: { appendChild: jest.fn() } };
    new Function('document', js)(doc);
    expect(doc.head.appendChild.mock.calls[0][0].textContent).toBe('a{content:"x\'y"}\nb{}');
  });
});
