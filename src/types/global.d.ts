import type moment from 'moment';

declare global {
  interface Window {
    moment: typeof moment;
  }
}
