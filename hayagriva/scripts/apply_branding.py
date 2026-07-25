import os
import base64
import re

repo_root = "/Users/atulgrover/Desktop/HAYAGRIVA"

# Image paths
small_logo_path = os.path.join(repo_root, "resources", "resources", "hayagriva_small.png")
medium_logo_path = os.path.join(repo_root, "resources", "resources", "hayagriva_medium.png")
large_logo_path = os.path.join(repo_root, "resources", "resources", "hayagriva_large.png")

# Icon target paths
icon_targets = [
    os.path.join(repo_root, "ide", "applications", "electron", "resources", "icons", "WindowIcon", "512-512.png"),
    os.path.join(repo_root, "ide", "applications", "electron", "resources", "icons", "MacLauncherIcons", "icon.icon", "Assets", "icon.png"),
    os.path.join(repo_root, "resources", "resources", "icons", "WindowIcon", "512-512.png"),
    os.path.join(repo_root, "resources", "resources", "icons", "512x512.png"),
    os.path.join(repo_root, "resources", "resources", "icon_black_512.png"),
    os.path.join(repo_root, "resources", "resources", "icon_white_512.png"),
    os.path.join(repo_root, "resources", "resources", "logo_black.png"),
    os.path.join(repo_root, "resources", "resources", "logo_white.png"),
]

# Splash screen targets
splash_targets = [
    os.path.join(repo_root, "ide", "applications", "electron", "resources", "TheiaIDESplash.svg"),
    os.path.join(repo_root, "ide", "applications", "browser", "resources", "TheiaIDESplash.svg"),
    os.path.join(repo_root, "resources", "resources", "TheiaIDESplash.svg"),
]

def load_base64(file_path):
    with open(file_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def apply_branding():
    print("[Branding Compiler] Starting application of Hayagriva horse logo...")
    
    # Verify files exist
    for p in [small_logo_path, medium_logo_path, large_logo_path]:
        if not os.path.exists(p):
            print(f"Error: Required file {p} does not exist.")
            return

    # Load base64 payloads
    print("  -> Loading and encoding logo assets...")
    small_b64 = load_base64(small_logo_path)
    medium_b64 = load_base64(medium_logo_path)
    large_b64 = load_base64(large_logo_path)

    # 1. Overwrite launcher PNG icons
    print("  -> Copying large horse logo to launcher target icons...")
    with open(large_logo_path, "rb") as src_f:
        large_bytes = src_f.read()
    for target in icon_targets:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as dest_f:
            dest_f.write(large_bytes)
        print(f"     ✓ Wrote: {os.path.relpath(target, repo_root)}")

    # 2. Patch Splash Screen SVGs
    print("  -> Patching Splash Screen SVG files with base64 horse logo...")
    for splash_path in splash_targets:
        if os.path.exists(splash_path):
            with open(splash_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Find the href attribute in the mask image
            # Pattern matches: href="data:image/png;base64,..."
            pattern = r'href="data:image/png;base64,[^"]+"'
            new_href = f'href="data:image/png;base64,{large_b64}"'
            updated_content, count = re.subn(pattern, new_href, content)
            
            if count > 0:
                with open(splash_path, "w", encoding="utf-8") as f:
                    f.write(updated_content)
                print(f"     ✓ Patched: {os.path.relpath(splash_path, repo_root)}")
            else:
                print(f"     ⚠️ Warning: No logo-mask href pattern matched in {splash_path}")
        else:
            print(f"     ⚠️ Warning: Splash screen not found at {splash_path}")

    # 3. Patch Settings Dashboard HTML
    print("  -> Patching settings-dashboard.html header with inline horse logo...")
    dashboard_path = os.path.join(repo_root, "hayagriva", "lib", "assets", "settings-dashboard.html")
    if os.path.exists(dashboard_path):
        with open(dashboard_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Replace the header line
        target_header = """    <h2>
      <span>Hayagriva Case Settings</span>
      <span class="version-badge" id="vaultVer">Vault Status</span>
    </h2>"""
        replacement_header = f"""    <h2>
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="data:image/png;base64,{small_b64}" style="width: 24px; height: 24px; object-fit: contain;" />
        <span>Hayagriva Case Settings</span>
      </div>
      <span class="version-badge" id="vaultVer">Vault Status</span>
    </h2>"""
        
        # Check if already patched
        if "data:image/png;base64" in content:
            # Re-patching: replace the dynamic header structure
            content = re.sub(r'<h2>\s*<div.*?>.*?<span>Hayagriva Case Settings</span>.*?</div>\s*<span class="version-badge" id="vaultVer">Vault Status</span>\s*</h2>', replacement_header, content, flags=re.DOTALL)
            print("     ✓ Re-patched existing header in settings-dashboard.html")
        else:
            content = content.replace(target_header, replacement_header)
            print("     ✓ Patched new header in settings-dashboard.html")
            
        with open(dashboard_path, "w", encoding="utf-8") as f:
            f.write(content)

    # 4. Patch extension.ts in browser extension
    print("  -> Injecting logo CSS overrides into extension.ts...")
    extension_path = os.path.join(repo_root, "ide", "theia-extensions", "hayagriva", "src", "browser", "extension.ts")
    if os.path.exists(extension_path):
        with open(extension_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        # We will insert constants and inject them into the style block
        # Let's locate the style element setup in onStart
        style_block_target = """    style.id = 'hayagriva-hide-filetype-icons';
    style.textContent = `
      .theia-FileStatNode:not(.theia-DirNode) .file-icon,
      .theia-FileStatNode:not(.theia-DirNode) .theia-FileStatIcon,
      .theia-FileStatNode:not(.theia-DirNode) [class*="file-icon"] {
          display: none !important;
      }
      #theia-open-editors-widget,
      .theia-open-editors-widget,
      .theia-NavigatorWidget > .p-Panel > .theia-open-editors-widget {
          display: none !important;
      }
    `;"""

        # Our custom CSS rules override the robot welcome icon and chatbot response icon
        replacement_style_block = f"""    style.id = 'hayagriva-hide-filetype-icons';
    style.textContent = `
      .theia-FileStatNode:not(.theia-DirNode) .file-icon,
      .theia-FileStatNode:not(.theia-DirNode) .theia-FileStatIcon,
      .theia-FileStatNode:not(.theia-DirNode) [class*="file-icon"] {{
          display: none !important;
      }}
      #theia-open-editors-widget,
      .theia-open-editors-widget,
      .theia-NavigatorWidget > .p-Panel > .theia-open-editors-widget {{
          display: none !important;
      }}
      
      /* --- HAYAGRIVA Custom Branding Logo Overrides --- */
      svg.theia-WelcomeMessage-Logo * {{
          display: none !important;
      }}
      svg.theia-WelcomeMessage-Logo {{
          background-image: url('data:image/png;base64,{medium_b64}') !important;
          background-size: contain !important;
          background-repeat: no-repeat !important;
          background-position: center !important;
          width: 120px !important;
          height: 120px !important;
      }}
      svg.theia-WelcomeMessage-Logo[width="64"] {{
          width: 64px !important;
          height: 64px !important;
      }}
      .theia-AgentAvatar.codicon-copilot::before {{
          content: "" !important;
      }}
      .theia-AgentAvatar.codicon-copilot {{
          background-image: url('data:image/png;base64,{small_b64}') !important;
          background-size: contain !important;
          background-repeat: no-repeat !important;
          background-position: center !important;
          width: 20px !important;
          height: 20px !important;
          display: inline-block !important;
      }}
    `;"""

        if style_block_target in content:
            content = content.replace(style_block_target, replacement_style_block)
            print("     ✓ Successfully patched styling overrides in extension.ts")
        elif "HAYAGRIVA Custom Branding Logo Overrides" in content:
            # Already patched, let's update it by regex to make sure it's clean
            # We can find the custom overrides block and update the base64 values
            pattern = r'/\* --- HAYAGRIVA Custom Branding Logo Overrides --- \*/.*?\.theia-AgentAvatar\.codicon-copilot .*?\}'
            content = re.sub(pattern, f"""/* --- HAYAGRIVA Custom Branding Logo Overrides --- */
      svg.theia-WelcomeMessage-Logo * {{
          display: none !important;
      }}
      svg.theia-WelcomeMessage-Logo {{
          background-image: url('data:image/png;base64,{medium_b64}') !important;
          background-size: contain !important;
          background-repeat: no-repeat !important;
          background-position: center !important;
          width: 120px !important;
          height: 120px !important;
      }}
      svg.theia-WelcomeMessage-Logo[width="64"] {{
          width: 64px !important;
          height: 64px !important;
      }}
      .theia-AgentAvatar.codicon-copilot::before {{
          content: "" !important;
      }}
      .theia-AgentAvatar.codicon-copilot {{
          background-image: url('data:image/png;base64,{small_b64}') !important;
          background-size: contain !important;
          background-repeat: no-repeat !important;
          background-position: center !important;
          width: 20px !important;
          height: 20px !important;
          display: inline-block !important;
      }}""", content, flags=re.DOTALL)
            print("     ✓ Updated existing styling overrides in extension.ts")
        else:
            print("     ⚠️ Warning: Could not locate target style element setup in extension.ts")

        with open(extension_path, "w", encoding="utf-8") as f:
            f.write(content)

    print("[Branding Compiler] Finished branding configuration successfully!\n")

if __name__ == "__main__":
    apply_branding()
