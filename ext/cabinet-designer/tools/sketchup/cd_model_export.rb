# Cabinet Designer model export for SketchUp (loader).
# Install: SketchUp > Window (or Extensions) > Extension Manager > Install Extension, pick cd_model_export.rbz.
# Then: Extensions > Export models for Cabinet Designer...
require 'sketchup.rb'
require 'extensions.rb'

module LarkulCD
  module ModelExport
    unless file_loaded?(__FILE__)
      ext = SketchupExtension.new('Cabinet Designer model export', 'cd_model_export/main')
      ext.description = 'Turns a whole folder of SketchUp models (like a Mozaik library) into models Cabinet Designer can load.'
      ext.version = '1.0.0'
      ext.creator = 'Larkul Custom'
      Sketchup.register_extension(ext, true)
      file_loaded(__FILE__)
    end
  end
end
