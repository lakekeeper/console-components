import { provide } from 'vue';

/**
 * Detach this component's menus from any `v-menu` it was rendered inside.
 *
 * Every `v-menu` registers with the nearest parent `v-menu` it finds through
 * inject, and a click outside a child menu also closes that parent. Our dialogs
 * often live inside an actions menu (Settings → Manage tags), so picking a tag
 * from a menu inside the dialog and then clicking elsewhere closed the actions
 * menu — and the dialog with it, since it is part of the menu's content.
 *
 * Call this at the top of a dialog that can be opened from a menu. Menus inside
 * the dialog then start their own chain.
 *
 * The key is Vuetify-internal (`VMenuSymbol` in `components/VMenu/shared`). It
 * is a global-registry symbol, so it matches without importing internals, but a
 * Vuetify upgrade could rename it — if dialogs start closing again, look here.
 */
export function useMenuBoundary() {
  provide(Symbol.for('vuetify:v-menu'), null);
}
