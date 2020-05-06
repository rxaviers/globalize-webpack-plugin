// Type definitions for globalize-webpack-plugin 3.0.0
// Project: globalize-webpack-plugin
// Definitions by: Dustin Steiner <dustin.steiner@gmail.com>

export = GlobalizePlugin;

declare class GlobalizePlugin {
  constructor(attributes: GlobalizePlugin.GlobalizePluginAttributes);
  
  apply(compiler: any): void;
}

declare namespace GlobalizePlugin {
  type CldrFunction = (locale: string) => object;
  
  interface TimeZoneLocation {
      abbrs: string[];
      untils: number[];
      offsets: number[];
      isdsts: number[];
    }
  
  interface TimeZoneArea {
    [location: string]: TimeZoneLocation
  }
  
  interface TimeZoneAreaData {
    [area: string]: TimeZoneArea
  }
  
  interface TimeZoneData {
    zoneData: TimeZoneAreaData
  }
  
  type TimeZoneDataFunction = () => TimeZoneData;
  
  type ModuleFilterFunction = (path: string) => boolean;

  export interface GlobalizePluginAttributes {
    production: boolean;
    developmentLocale: string;
    supportedLocales: string[];
    cldr?: CldrFunction;
    messages?: string | string[];
    timeZoneData?: TimeZoneDataFunction;
    output?: string;
    moduleFilter: ModuleFilterFunction;
    tmpdirBase?: string
  }
}
