# Cabinet Designer model export: walks a folder (and its subfolders) for .skp files and writes each one as a
# small mesh file (.cdm.json) in a "CD Models" folder inside it, keeping the subfolders. Cabinet Designer reads
# those, plus the Mozaik .moz products and Library.ndx in the same folder, in one pick.
#
# It works in SketchUp Make 2017 (free) and every SketchUp Pro since 2015, because it reads the geometry itself
# and does not use SketchUp's exporters. Files already exported (and not changed since) are skipped, so a run
# that is stopped can be started again and carries on.
#
# Mozaik's flat elevation, side and plan drawings (names ending _ele, _side, _plan or _2D) are skipped.
# Textured materials are saved as pictures in a "<model>.tex" folder beside each model file.
require 'sketchup.rb'
require 'fileutils'

module LarkulCD
  module ModelExport
    OUT_DIR = 'CD Models'.freeze
    SKIP = /_(ele|elev|plan|2d|side)\z/i

    def self.fmt(v)
      s = format('%.3f', v)
      s = s.sub(/\.?0+\z/, '')
      s == '-0' ? '0' : s
    end

    def self.hex(c)
      format('#%02x%02x%02x', c.red, c.green, c.blue)
    end

    def self.json_str(s)
      '"' + s.to_s.gsub(/[\\"]/) { |m| '\\' + m }.gsub(/[\u0000-\u001f]/) { |m| format('\\u%04x', m.ord) } + '"'
    end

    def self.visible?(e)
      return false if e.respond_to?(:hidden?) && e.hidden?
      return false if e.respond_to?(:layer) && e.layer && !e.layer.visible?
      true
    end

    # Collects triangles by material, with texture coordinates for textured ones, and the edge lines SketchUp
    # draws (not the soft or smooth ones on curved surfaces). Points are in inches in the model's own axes
    # (x right, y back, z up).
    def self.walk(ents, tr, mat, out)
      ents.each do |e|
        next unless visible?(e)
        if e.is_a?(Sketchup::Face)
          own = e.material ? [e.material, true] : e.back_material ? [e.back_material, false] : nil
          m = own ? own[0] : mat
          tex = m && m.texture
          key = m ? m.entityID : 0
          b = out[:mats][key] ||= { mat: m, face: nil, pts: [], uvs: [], map: {}, idx: [] }
          b[:face] ||= e if tex && own
          mesh = e.mesh(tex && own ? (own[1] ? 1 : 2) : 0)
          if tex && !own
            # Painted on the group, not the face: SketchUp maps the texture from the face's plane at its real size.
            n = e.normal
            ax = [n.x.abs, n.y.abs, n.z.abs]
            drop = ax.index(ax.max)
            tw = tex.width.to_f.nonzero? || 1.0
            th = tex.height.to_f.nonzero? || 1.0
          end
          ids = (1..mesh.count_points).map do |i|
            lp = mesh.point_at(i)
            p = tr * lp
            k = fmt(p.x) + ',' + fmt(p.y) + ',' + fmt(p.z)
            if tex
              if own
                q = mesh.uv_at(i, own[1])
                z = q.z.to_f.nonzero? || 1.0
                uv = [q.x / z, q.y / z]
              else
                c = [lp.x, lp.y, lp.z]
                c.delete_at(drop)
                uv = [c[0] / tw, c[1] / th]
              end
              k += '|' + fmt(uv[0]) + ',' + fmt(uv[1])
            end
            b[:map][k] ||= begin
              b[:pts] << k.split('|')[0]
              b[:uvs] << k.split('|')[1] if tex
              b[:pts].length - 1
            end
          end
          mesh.polygons.each do |poly|
            v = poly.map { |n2| ids[n2.abs - 1] }
            (1...(v.length - 1)).each { |j| b[:idx].push(v[0], v[j], v[j + 1]) }
          end
        elsif e.is_a?(Sketchup::Edge)
          next if e.soft? || e.smooth?
          [e.start.position, e.end.position].each { |pt| q = tr * pt; out[:edges].push(fmt(q.x), fmt(q.y), fmt(q.z)) }
        elsif e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
          sub = e.is_a?(Sketchup::Group) ? e.entities : e.definition.entities
          walk(sub, tr * e.transformation, e.material || mat, out)
        end
      end
    end

    # Saves a material's picture (with SketchUp's colour adjustment) beside the model file.
    def self.write_texture(b, dir, n)
      t = b[:mat].texture
      ext = File.extname(t.filename.to_s).downcase
      ext = '.png' unless %w[.jpg .jpeg .png .bmp .tif .tiff].include?(ext)
      ext = '.png' if %w[.bmp .tif .tiff].include?(ext)
      path = File.join(dir, "#{n}#{ext}")
      FileUtils.mkdir_p(dir)
      ok = false
      ok = t.write(path, true) if t.respond_to?(:write)
      if !ok && b[:face]
        tw = Sketchup.create_texture_writer
        tw.load(b[:face], true)
        ok = tw.write(b[:face], true, path) == 0
      end
      ok && File.exist?(path) ? path : nil
    rescue StandardError
      nil
    end

    def self.export_one(model, src, dst)
      defn = model.definitions.load(src)
      out = { mats: {}, edges: [] }
      walk(defn.entities, Geom::Transformation.new, nil, out)
      bufs = out[:mats].values.reject { |b| b[:idx].empty? }
      return false if bufs.empty?
      lo = [Float::INFINITY] * 3
      hi = [-Float::INFINITY] * 3
      bufs.each do |b|
        b[:pts].each do |k|
          k.split(',').map(&:to_f).each_with_index { |v, i| lo[i] = v if v < lo[i]; hi[i] = v if v > hi[i] }
        end
      end
      base = File.basename(dst, '.cdm.json')
      texdir = File.join(File.dirname(dst), base + '.tex')
      FileUtils.rm_rf(texdir)
      mats = bufs.each_with_index.map do |b, n|
        m = b[:mat]
        c = m ? hex(m.color) : '#e8e8e8'
        a = m ? fmt(m.alpha) : '1'
        s = '{"c":' + json_str(c) + ',"o":' + a + ',"p":[' + b[:pts].join(',') + '],"i":[' + b[:idx].join(',') + ']'
        if m && m.texture && !b[:uvs].empty? && (tp = write_texture(b, texdir, n))
          s += ',"t":' + json_str(base + '.tex/' + File.basename(tp)) + ',"u":[' + b[:uvs].join(',') + ']'
        end
        s + '}'
      end
      name = File.basename(src, '.*')
      json = '{"v":2,"name":' + json_str(name) + ',"unit":"in","box":[' + (lo + hi).map { |v| fmt(v) }.join(',') + '],"mats":[' + mats.join(',') + '],"e":[' + out[:edges].join(',') + ']}'
      FileUtils.mkdir_p(File.dirname(dst))
      File.open(dst, 'wb') { |f| f.write(json) }
      true
    ensure
      # Keep the open model empty between files so memory does not pile up over a thousand of them.
      model.definitions.purge_unused
      model.materials.purge_unused
    end

    # Already exported with this version and not changed since.
    def self.current?(src, dst)
      return false unless File.exist?(dst) && File.mtime(dst) >= File.mtime(src)
      File.open(dst, 'rb') { |f| f.read(8) } == '{"v":2,"'
    rescue StandardError
      false
    end

    def self.run
      root = UI.select_directory(title: 'Pick the folder with the SketchUp models (a Mozaik library folder works)')
      return unless root
      root = root.tr('\\', '/')
      files = Dir.glob(File.join(root, '**', '*.skp'), File::FNM_CASEFOLD)
                 .reject { |f| f.include?('/' + OUT_DIR + '/') || File.basename(f, '.*') =~ SKIP }
                 .sort
      if files.empty?
        UI.messagebox('There are no SketchUp files in that folder.')
        return
      end
      model = Sketchup.active_model
      return if UI.messagebox("Export #{files.length} models for Cabinet Designer?\n\nThey go in \"#{OUT_DIR}\" inside the folder you picked. Run it from a new, empty SketchUp model. You can use other programs while it runs.", MB_OKCANCEL) != IDOK
      @state = { root: root, files: files, i: 0, done: 0, skipped: 0, empty: 0, failed: [], started: Time.now, model: model }
      step
    end

    # One file per timer tick so SketchUp keeps drawing its status bar and can be closed if needed.
    def self.step
      s = @state
      return finish if s[:i] >= s[:files].length
      src = s[:files][s[:i]]
      s[:i] += 1
      rel = src[(s[:root].length + 1)..-1]
      dst = File.join(s[:root], OUT_DIR, rel.sub(/\.skp\z/i, '.cdm.json'))
      Sketchup.status_text = "Cabinet Designer export: #{s[:i]} of #{s[:files].length}  #{rel}"
      begin
        if current?(src, dst)
          s[:skipped] += 1
        elsif export_one(s[:model], src, dst)
          s[:done] += 1
        else
          s[:empty] += 1
        end
      rescue StandardError => e
        s[:failed] << "#{rel}: #{e.message}"
      end
      UI.start_timer(0, false) { step }
    end

    def self.finish
      s = @state
      mins = ((Time.now - s[:started]) / 60.0).round(1)
      log = File.join(s[:root], OUT_DIR, 'export-log.txt')
      FileUtils.mkdir_p(File.dirname(log))
      File.open(log, 'w') do |f|
        f.puts "Exported #{s[:done]}, already done #{s[:skipped]}, empty #{s[:empty]}, failed #{s[:failed].length}, #{mins} min"
        s[:failed].each { |x| f.puts x }
      end
      Sketchup.status_text = ''
      msg = "Done in #{mins} minutes.\n\nExported: #{s[:done]}\nAlready exported: #{s[:skipped]}\nNo geometry: #{s[:empty]}\nCould not open: #{s[:failed].length}"
      msg += "\n\nThe ones that failed are listed in #{OUT_DIR}/export-log.txt." unless s[:failed].empty?
      msg += "\n\nNow open Cabinet Designer, Products > Import models, and pick this same folder."
      UI.messagebox(msg)
    end

    unless file_loaded?(__FILE__)
      UI.menu('Extensions').add_item('Export models for Cabinet Designer...') { run }
      file_loaded(__FILE__)
    end
  end
end
