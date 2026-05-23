import type { StyleId } from '../styles';
import { LOFI_GUIDE } from './lofi';
import { HOUSE_GUIDE } from './house';
import { DNB_GUIDE } from './dnb';
import { AMBIENT_GUIDE } from './ambient';
import { TECHNO_GUIDE } from './techno';
import { SYNTHWAVE_GUIDE } from './synthwave';
import { TRAP_GUIDE } from './trap';
import { JAZZ_GUIDE } from './jazz';

export { LOFI_GUIDE, HOUSE_GUIDE, DNB_GUIDE, AMBIENT_GUIDE, TECHNO_GUIDE, SYNTHWAVE_GUIDE, TRAP_GUIDE, JAZZ_GUIDE };

export const STYLE_GUIDES: Record<StyleId, string> = {
  lofi: LOFI_GUIDE,
  house: HOUSE_GUIDE,
  dnb: DNB_GUIDE,
  ambient: AMBIENT_GUIDE,
  techno: TECHNO_GUIDE,
  synthwave: SYNTHWAVE_GUIDE,
  trap: TRAP_GUIDE,
  jazz: JAZZ_GUIDE,
};
