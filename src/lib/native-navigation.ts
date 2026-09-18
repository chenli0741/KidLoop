import {Capacitor,registerPlugin} from '@capacitor/core';
import {mapNavigationUrl,type MapProvider} from './map-navigation';

const navigation=registerPlugin<{navigate(options:{provider:MapProvider;address:string;name:string}):Promise<void>}>('KidLoopNavigation');

export async function startMapNavigation(provider:MapProvider,address:string,name:string){
  if(Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('KidLoopNavigation')){
    await navigation.navigate({provider,address,name});
    return;
  }
  window.location.assign(mapNavigationUrl(provider,address));
}
