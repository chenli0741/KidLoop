import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const info=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',root+'ios/App/App/Info.plist'],{encoding:'utf8'}));
const keys=['NSCameraUsageDescription','NSPhotoLibraryUsageDescription','NSPhotoLibraryAddUsageDescription','NSMicrophoneUsageDescription','NSSpeechRecognitionUsageDescription','NSLocationWhenInUseUsageDescription','NSLocationAlwaysAndWhenInUseUsageDescription'];
for(const key of keys)if(typeof info[key]!=='string'||!info[key].trim())throw new Error('Missing iOS permission description: '+key);
const config=JSON.parse(readFileSync(root+'ios/App/App/capacitor.config.json','utf8'));
const serverUrl=config.server?.url;
if(!process.env.CAPACITOR_SERVER_URL&&serverUrl!=='https://kid-loop.vercel.app')throw new Error('Default iOS sync must use https://kid-loop.vercel.app; found '+String(serverUrl));
if(serverUrl?.startsWith('http://')&&process.env.CAPACITOR_SERVER_URL!==serverUrl)throw new Error('Cleartext iOS server URL requires an explicit CAPACITOR_SERVER_URL for local development');
const packages=readFileSync(root+'ios/App/CapApp-SPM/Package.swift','utf8');
for(const [native,product] of [['CAPCameraPlugin','CapacitorCamera'],['GeolocationPlugin','CapacitorGeolocation'],['CAPBrowserPlugin','CapacitorBrowser']]){
 if(!config.packageClassList?.includes(native)||!packages.includes('.product(name: "'+product+'"'))throw new Error('Native plugin missing after sync: '+native);
}
console.log('iOS capability check passed: Camera, Photos, Microphone, Speech descriptions; Camera, Geolocation and Browser native packages registered.');
const delegate=readFileSync(root+'ios/App/App/SceneDelegate.swift','utf8');
const project=readFileSync(root+'ios/App/KidLoop.xcodeproj/project.pbxproj','utf8');
if(!delegate.includes('registerPluginInstance(KidLoopOCRPlugin())')||!delegate.includes('rootViewController = KidLoopBridgeViewController()')||!project.includes('KidLoopOCRPlugin.swift in Sources')||!project.includes('DeviceVision.swift in Sources'))throw new Error('Native OCR bridge not registered or linked');
console.log('Native OCR bridge source and registration check passed.');
if(!delegate.includes('registerPluginInstance(KidLoopNavigationPlugin())')||!project.includes('KidLoopNavigationPlugin.swift in Sources')||!info.LSApplicationQueriesSchemes?.includes('comgooglemaps'))throw new Error('Native map navigation bridge not registered, linked or configured');
console.log('Native Apple Maps / Google Maps navigation bridge check passed.');
if(!delegate.includes('registerPluginInstance(KidLoopCredentialsPlugin())')||!project.includes('KidLoopCredentialsPlugin.swift in Sources'))throw new Error('Native saved-login Keychain bridge not registered or linked');
console.log('Native multi-account Keychain bridge check passed.');
if(!delegate.includes('registerPluginInstance(KidLoopCalendarAuthPlugin())')||!project.includes('KidLoopCalendarAuthPlugin.swift in Sources')||!info.CFBundleURLTypes?.some(group=>group.CFBundleURLSchemes?.includes('kidloop-calendar')))throw new Error('Native Google Calendar authorization bridge not registered, linked or configured');
console.log('Native Google Calendar authorization bridge check passed.');
if(!delegate.includes('registerPluginInstance(KidLoopNotificationsPlugin())')||!project.includes('KidLoopNotificationsPlugin.swift in Sources')||!project.includes('CODE_SIGN_ENTITLEMENTS = App/KidLoop.entitlements'))throw new Error('Native notification bridge or APNs entitlement missing');
console.log('Native APNs notification bridge and entitlement check passed.');
console.log('iOS server URL check passed: '+serverUrl);
