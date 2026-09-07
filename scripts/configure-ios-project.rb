#!/usr/bin/env ruby

require "fileutils"
require "xcodeproj"

root = File.expand_path("..", __dir__)
native_dir = File.join(root, "ios", "App")
source_project = File.join(native_dir, "App.xcodeproj")
named_project = File.join(native_dir, "KidLoop.xcodeproj")
project_path = File.exist?(named_project) ? named_project : source_project

abort("Capacitor iOS project not found") unless File.exist?(project_path)

project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |candidate| ["App", "KidLoop"].include?(candidate.name) }
abort("Application target not found") unless target

target.name = "KidLoop"
target.product_name = "KidLoop"
target.product_reference.name = "KidLoop.app"
target.product_reference.path = "KidLoop.app"

target.build_configurations.each do |configuration|
  settings = configuration.build_settings
  settings["PRODUCT_NAME"] = "KidLoop"
  settings["PRODUCT_BUNDLE_IDENTIFIER"] = "com.chenli0741.kidloop"
  settings["TARGETED_DEVICE_FAMILY"] = "1"
  settings["SUPPORTS_MACCATALYST"] = "NO"
  settings["SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD"] = "NO"
end

project.save
project.recreate_user_schemes

info_path = File.join(native_dir, "App", "Info.plist")
info = Xcodeproj::Plist.read_from_path(info_path)
info["CFBundleDisplayName"] = "KidLoop"
info.delete("UISupportedInterfaceOrientations~ipad")
Xcodeproj::Plist.write_to_path(info, info_path)

if project_path == source_project
  FileUtils.mv(source_project, named_project)
end

user_scheme = Xcodeproj::XCScheme.user_data_dir(named_project) + "KidLoop.xcscheme"
Xcodeproj::XCScheme.share_scheme(named_project, "KidLoop") if user_scheme.exist?

puts "Configured #{named_project} for iPhone-only builds"
