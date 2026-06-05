export type StyleId = 'lofi' | 'house' | 'dnb' | 'ambient' | 'techno' | 'synthwave' | 'trap' | 'jazz' | 'blues' | 'funk' | 'bossanova' | 'reggae' | 'classical' | 'rnb' | 'folk' | 'country' | 'latin' | 'afrobeat';

import { LOFI_GUIDE as LOFI_GUIDE } from './lofi';
import { HOUSE_GUIDE as HOUSE_GUIDE } from './house';
import { DNB_GUIDE as DNB_GUIDE } from './dnb';
import { AMBIENT_GUIDE as AMBIENT_GUIDE } from './ambient';
import { TECHNO_GUIDE as TECHNO_GUIDE } from './techno';
import { SYNTHWAVE_GUIDE as SYNTHWAVE_GUIDE } from './synthwave';
import { TRAP_GUIDE as TRAP_GUIDE } from './trap';
import { JAZZ_GUIDE as JAZZ_GUIDE } from './jazz';
import { BLUES_GUIDE as BLUES_GUIDE } from './blues';
import { FUNK_GUIDE as FUNK_GUIDE } from './funk';
import { BOSSANOVA_GUIDE as BOSSANOVA_GUIDE } from './bossanova';
import { REGGAE_GUIDE as REGGAE_GUIDE } from './reggae';
import { CLASSICAL_GUIDE as CLASSICAL_GUIDE } from './classical';
import { RNB_GUIDE as RNB_GUIDE } from './rnb';
import { FOLK_GUIDE as FOLK_GUIDE } from './folk';
import { COUNTRY_GUIDE as COUNTRY_GUIDE } from './country';
import { LATIN_GUIDE as LATIN_GUIDE } from './latin';
import { AFROBEAT_GUIDE as AFROBEAT_GUIDE } from './afrobeat';

export { LOFI_GUIDE as LOFI_GUIDE, HOUSE_GUIDE as HOUSE_GUIDE, DNB_GUIDE as DNB_GUIDE, AMBIENT_GUIDE as AMBIENT_GUIDE, TECHNO_GUIDE as TECHNO_GUIDE, SYNTHWAVE_GUIDE as SYNTHWAVE_GUIDE, TRAP_GUIDE as TRAP_GUIDE, JAZZ_GUIDE as JAZZ_GUIDE, BLUES_GUIDE as BLUES_GUIDE, FUNK_GUIDE as FUNK_GUIDE, BOSSANOVA_GUIDE as BOSSANOVA_GUIDE, REGGAE_GUIDE as REGGAE_GUIDE, CLASSICAL_GUIDE as CLASSICAL_GUIDE, RNB_GUIDE as RNB_GUIDE, FOLK_GUIDE as FOLK_GUIDE, COUNTRY_GUIDE as COUNTRY_GUIDE, LATIN_GUIDE as LATIN_GUIDE, AFROBEAT_GUIDE as AFROBEAT_GUIDE };

export const STYLE_GUIDES: Record<StyleId, string> = {
  lofi: LOFI_GUIDE,
  house: HOUSE_GUIDE,
  dnb: DNB_GUIDE,
  ambient: AMBIENT_GUIDE,
  techno: TECHNO_GUIDE,
  synthwave: SYNTHWAVE_GUIDE,
  trap: TRAP_GUIDE,
  jazz: JAZZ_GUIDE,
  blues: BLUES_GUIDE,
  funk: FUNK_GUIDE,
  bossanova: BOSSANOVA_GUIDE,
  reggae: REGGAE_GUIDE,
  classical: CLASSICAL_GUIDE,
  rnb: RNB_GUIDE,
  folk: FOLK_GUIDE,
  country: COUNTRY_GUIDE,
  latin: LATIN_GUIDE,
  afrobeat: AFROBEAT_GUIDE,
};
