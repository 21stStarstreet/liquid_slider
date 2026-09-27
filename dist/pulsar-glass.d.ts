/**
 * Pulsar Glass — Liquid Glass Segmented Slider
 * TypeScript Type Definitions
 *
 * @author Mustafa Tıraş
 * @license MIT
 */

export interface PulsarGlassOptions {
  /** Maximum overdrag distance (px) when dragging past the track boundaries. Default: 44 */
  maxOvershoot?: number;
  /** Fluid surface tension resistance coefficient. Default: 110 */
  pullResistance?: number;
  /** Base flight duration (ms) for click transitions. Default: 310 */
  flightDurationBase?: number;
  /** Additional duration scale per pixel distance. Default: 0.35 */
  flightDurationScale?: number;
  /** Minimum flight duration clamp (ms). Default: 340 */
  flightDurationMin?: number;
  /** Maximum flight duration clamp (ms). Default: 440 */
  flightDurationMax?: number;
  /** Whether chromatic aberration prismatic refraction is enabled. Default: true */
  enableRefraction?: boolean;
  /** Whether underwater label displacement is enabled. Default: true */
  enableWaterRefraction?: boolean;
  /** Callback fired when a button is selected by click or pointerup. */
  onSelect?: (index: number, value: string, element: HTMLButtonElement) => void;
  /** Callback fired whenever the active selection changes. */
  onChange?: (index: number, value: string, element: HTMLButtonElement) => void;
  /** Blazor interop reference helper (internal). */
  dotNetHelper?: any;
}

export class PulsarGlassSlider {
  constructor(selector: string | HTMLElement, options?: PulsarGlassOptions);
  container: HTMLElement | null;
  sliderEl: HTMLElement | null;
  buttons: HTMLButtonElement[];
  activeIndex: number;

  selectIndex(index: number, animate?: boolean): void;
  selectByValue(value: string, animate?: boolean): void;
  refresh(): void;
  destroy(): void;
}

export namespace PulsarGlass {
  export function create(
    selector: string | HTMLElement,
    options?: PulsarGlassOptions
  ): PulsarGlassSlider | null;
  export function ensureSvgFilters(): void;
  export function setTheme(theme: 'light' | 'dark'): void;
  export const FILTER_LENS_ID: string;
  export const FILTER_WATER_ID: string;
  export { PulsarGlassSlider };
}

export default PulsarGlass;
