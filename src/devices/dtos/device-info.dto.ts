import { PlatformType } from '../constants';

export interface DeviceInfo {
  /** 'iOS' or 'Android' */
  platform: PlatformType;

  /** iOS: `name` | Android: `name` */
  name: string;

  /** iOS only: `systemName` */
  systemName?: string;

  /** iOS: `systemVersion` | Android: `version.release` */
  osVersion: string;

  /** Android only: `version.sdkInt` */
  sdkInt?: number;

  /** iOS: `model` | Android: `model` */
  model: string;

  /** iOS only: `modelName` */
  modelName?: string;

  /** Android only: `brand` */
  brand?: string;

  /** Android only: `device` */
  device?: string;

  /** Android only: `manufacturer` */
  manufacturer?: string;

  /** iOS only: `identifierForVendor` */
  identifierForVendor?: string;

  /** iOS & Android: `isPhysicalDevice` */
  isPhysicalDevice: boolean;
}
