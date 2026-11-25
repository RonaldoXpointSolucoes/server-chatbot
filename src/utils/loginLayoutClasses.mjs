/**
 * Classes compartilhadas de layout rolável para telas públicas/modais fora do MainLayout.
 * `html, body, #root` usam `height: 100%; overflow: hidden; position: fixed` no `index.css`;
 * por isso, o container externo precisa fixar a viewport com `overflow-y-auto` sem `justify-center`
 * (evitando corte do topo ao rolar), delegando o alinhamento ao wrapper interno `min-h-full`.
 */
export const LOGIN_SCROLL_OUTER_CLASS =
  'h-[100dvh] w-full overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch] safe-padding relative';

export const LOGIN_SCROLL_INNER_CLASS =
  'min-h-full w-full flex flex-col items-center justify-center relative z-10';

export const MODAL_SCROLL_BACKDROP_CLASS =
  'fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-black/75 backdrop-blur-xl animate-in fade-in duration-300';

export const MODAL_SCROLL_INNER_CLASS =
  'min-h-full w-full flex items-center justify-center p-4';
