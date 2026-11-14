import icebergIcon from '@/assets/iceberg.svg';
import deltaIcon from '@/assets/delta.svg';
import vortexLightIcon from '@/assets/vortex_logo.svg';
import vortexDarkIcon from '@/assets/vortex_logo_dark_theme.svg';
import lanceIcon from '@/assets/lance.png';
import paimonIcon from '@/assets/paimon.svg';
import zarrIcon from '@/assets/zarr.png';
import icechunkIcon from '@/assets/icechunk.png';

/**
 * Brand icon for a table format, or `null` for a format without one (callers
 * fall back to a generic glyph). Vortex ships a light and a dark variant.
 */
export function formatIcon(format: string | undefined, themeLight: boolean): string | null {
  switch ((format ?? '').toLowerCase()) {
    case 'iceberg':
      return icebergIcon;
    case 'delta':
      return deltaIcon;
    case 'lance':
      return lanceIcon;
    case 'paimon':
      return paimonIcon;
    case 'zarr':
      return zarrIcon;
    case 'icechunk':
      return icechunkIcon;
    case 'vortex':
      return themeLight ? vortexLightIcon : vortexDarkIcon;
    default:
      return null;
  }
}
