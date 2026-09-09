import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const info=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',root+'ios/App/App/Info.plist'],{encoding:'utf8'}));
const keys=['NSCameraUsageDescription','NSPhotoLibraryUsageDescription','NSPhotoLibraryAddUsageDescription','NSMicrophoneUsageDescription','NSSpeechRecognitionUsageDescription','NSLocationWhenInUseUsageDescription','NSLocationAlwaysAndWhenInUseUsageDescription'];
for(const key of keys)if(typeof info[key]!=='string'||!info[key].trim())throw new Error('Missing iOS permission description: '+key);
const config=JSON.parse(readFileSync(root+'ios/App/App/capacitor.config.json','utf8'));
const packages=readFileSync(root+'ios/App/CapApp-SPM/Package.swift','utf8');
for(const [native,product] of [['CAPCameraPlugin','CapacitorCamera'],['GeolocationPlugin','CapacitorGeolocation'],['CAPBrowserPlugin','CapacitorBrowser']]){
 if(!config.packageClassList?.includes(native)||!packages.includes('.product(name: "'+product+'"'))throw new Error('Native plugin missing after sync: '+native);
}
console.log('iOS capability check passed: Camera, Photos, Microphone, Speech descriptions; Camera, Geolocation and Browser native packages registered.');
const delegate=readFileSync(root+'ios/App/App/SceneDelegate.swift','utf8');
const project=readFileSync(root+'ios/App/KidLoop.xcodeproj/project.pbxproj','utf8');
if(!delegate.includes('registerPluginInstance(KidLoopOCRPlugin())')||!delegate.includes('rootViewController = KidLoopBridgeViewController()')||!project.includes('KidLoopOCRPlugin.swift in Sources')||!project.includes('DeviceVision.swift in Sources'))throw new Error('Native OCR bridge not registered or linked');
console.log('Native OCR bridge source and registration check passed.');
