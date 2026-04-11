#!/usr/bin/env python3
"""
构建脚本，用于生成不同浏览器版本的扩展包

支持平台：
- Chromium（Manifest V3）
- Firefox（Manifest V2）

使用方法：
    python build.py --platform all --package
"""

import argparse
import json
import os
import re
import shutil
import zipfile
from pathlib import Path


def create_build_directory(platform, clean=True):
    """
    创建构建目录

    Args:
        platform (str): 目标平台名称 (chrome/firefox)
        clean (bool): 是否清理已存在的目录

    Returns:
        Path: 构建目录路径
    """
    build_dir = Path(f"build/{platform}")
    if clean and build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir(parents=True, exist_ok=True)
    return build_dir


def copy_common_files(build_dir):
    """
    复制通用文件到构建目录

    Args:
        build_dir (Path): 目标构建目录
    """
    # 创建 src 目录结构
    src_dir = build_dir / "src"

    # 复制源代码目录
    if os.path.exists("src"):
        shutil.copytree("src", src_dir, dirs_exist_ok=True)

    # 复制根目录的文档文件
    doc_files = [
        "LICENSE",
        "README.md",
        "PRIVACY_POLICY.md",
        "SECURITY.md",
    ]

    for file in doc_files:
        if os.path.exists(file):
            shutil.copy2(file, build_dir)

    # 复制图标目录
    if os.path.exists("icons"):
        shutil.copytree("icons", build_dir / "icons", dirs_exist_ok=True)


def read_package_metadata():
    with open("package.json", encoding="utf-8") as f:
        package = json.load(f)

    return {
        "name": package["name"],
        "version": package["version"],
        "description": package["description"],
        "author": package["author"],
        "homepage": package["homepage"],
    }


def build_chrome():
    """
    构建 Chromium 版本

    Returns:
        Path: 构建目录路径
    """
    print("构建 Chrome 版本...")
    build_dir = create_build_directory("chrome")

    # 复制通用文件
    copy_common_files(build_dir)

    # 复制 Chrome manifest
    shutil.copy2("manifest.json", build_dir / "manifest.json")

    # 为 Chrome 创建扁平化的文件结构
    flatten_for_browser(build_dir, "chrome")

    print(f"Chrome 版本构建完成: {build_dir}")
    return build_dir


def build_firefox():
    """
    构建 Firefox 版本

    Returns:
        Path: 构建目录路径
    """
    print("构建 Firefox 版本...")
    build_dir = create_build_directory("firefox")

    # 复制通用文件
    copy_common_files(build_dir)

    # 复制 Firefox manifest
    shutil.copy2("manifest-firefox.json", build_dir / "manifest.json")

    # 为 Firefox 创建扁平化的文件结构
    flatten_for_browser(build_dir, "firefox")

    print(f"Firefox 版本构建完成: {build_dir}")
    return build_dir


def flatten_for_browser(build_dir, platform):
    """
    将 src 目录中的文件扁平化到构建目录根

    Args:
        build_dir (Path): 构建目录路径
        platform (str): 目标平台 (chrome/firefox)
    """
    src_dir = build_dir / "src"

    if not src_dir.exists():
        print(f"警告: {src_dir} 不存在")
        return

    # 将文件从 src 子目录移动到根目录
    # background/index.js -> background.js
    bg_file = src_dir / "background" / "index.js"
    if bg_file.exists():
        shutil.copy2(bg_file, build_dir / "background.js")

    # content/index.js -> content.js
    content_file = src_dir / "content" / "index.js"
    if content_file.exists():
        shutil.copy2(content_file, build_dir / "content.js")

    # popup/index.html -> popup.html
    popup_html = src_dir / "popup" / "index.html"
    if popup_html.exists():
        shutil.copy2(popup_html, build_dir / "popup.html")

    # popup/popup.js -> popup.js
    popup_js = src_dir / "popup" / "popup.js"
    if popup_js.exists():
        shutil.copy2(popup_js, build_dir / "popup.js")

    # shared/platforms.js -> platforms.js
    platforms_file = src_dir / "shared" / "platforms.js"
    if platforms_file.exists():
        shutil.copy2(platforms_file, build_dir / "platforms.js")

    # shared/download-core.js -> download-core.js
    download_core_file = src_dir / "shared" / "download-core.js"
    if download_core_file.exists():
        shutil.copy2(download_core_file, build_dir / "download-core.js")

    # shared/platform-detector.js -> platform-detector.js
    detector_file = src_dir / "shared" / "platform-detector.js"
    if detector_file.exists():
        shutil.copy2(detector_file, build_dir / "platform-detector.js")

    # shared/compat/webext-compat.js -> webext-compat.js
    webext_compat = src_dir / "shared" / "compat" / "webext-compat.js"
    if webext_compat.exists():
        shutil.copy2(webext_compat, build_dir / "webext-compat.js")

    # shared/compat/firefox-compat.js -> firefox-compat.js
    firefox_compat = src_dir / "shared" / "compat" / "firefox-compat.js"
    if firefox_compat.exists():
        shutil.copy2(firefox_compat, build_dir / "firefox-compat.js")

    # 删除 src 目录
    if src_dir.exists():
        shutil.rmtree(src_dir)

    # 平台特定优化
    if platform == "chrome":
        optimize_for_chrome(build_dir)
    elif platform == "firefox":
        optimize_for_firefox(build_dir)


def optimize_for_chrome(build_dir):
    """
    为 Chrome 优化文件

    Args:
        build_dir (Path): 构建目录路径
    """
    # 移除 background.js 中的 importScripts 调用，因为在 Manifest V3 中不需要
    bg_file = build_dir / "background.js"
    if bg_file.exists():
        content = bg_file.read_text(encoding="utf-8")
        # 注释掉 importScripts 调用
        content = content.replace(
            "importScripts('webext-compat.js');",
            "// importScripts('webext-compat.js'); // Chrome 不需要显式导入",
        )
        bg_file.write_text(content, encoding="utf-8")


def optimize_for_firefox(build_dir):
    """
    为 Firefox 优化文件

    Args:
        build_dir (Path): 构建目录路径
    """
    # Firefox 特有的优化可以在这里添加
    pass


def create_package(build_dir, platform):
    """
    创建扩展包

    Args:
        build_dir (Path): 构建目录路径
        platform (str): 目标平台名称 (chrome/firefox)

    Returns:
        Path: 扩展包文件路径
    """
    package_dir = Path("packages")
    package_dir.mkdir(exist_ok=True)

    # 读取版本信息
    manifest_file = build_dir / "manifest.json"
    with open(manifest_file, encoding="utf-8") as f:
        manifest = json.load(f)

    version = manifest["version"]

    # 根据平台设置文件扩展名和命名
    if platform == "chrome":
        file_ext = "zip"
        platform_name = "chromium"
    elif platform == "firefox":
        file_ext = "xpi"
        platform_name = "firefox"
    else:
        file_ext = "zip"
        platform_name = platform

    package_name = f"Xget-Now_{version}.{platform_name}.{file_ext}"
    package_path = package_dir / package_name

    # 创建扩展包
    compression = zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(package_path, "w", compression) as zipf:
        for file_path in build_dir.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(build_dir)
                zipf.write(file_path, arcname)

    print(f"扩展包已创建: {package_path}")
    return package_path


def create_userscript_package(script_path):
    package_dir = Path("packages")
    package_dir.mkdir(exist_ok=True)

    metadata = read_package_metadata()
    package_name = f"Xget-Now_{metadata['version']}.userscript.user.js"
    package_path = package_dir / package_name
    shutil.copy2(script_path, package_path)
    print(f"用户脚本包已创建: {package_path}")
    return package_path


def extract_userscript_matches():
    source = Path("src/shared/download-core.js").read_text(encoding="utf-8")
    match = re.search(
        r"const CORE_USERSCRIPT_MATCHES = \[(.*?)\];",
        source,
        re.DOTALL,
    )

    if not match:
        raise ValueError("无法从 download-core.js 中提取 CORE_USERSCRIPT_MATCHES")

    raw_items = match.group(1)
    return re.findall(r'"([^"]+)"', raw_items)


def build_userscript():
    print("构建 userscript 版本...")
    build_dir = create_build_directory("userscript")
    metadata = read_package_metadata()
    matches = extract_userscript_matches()

    metadata_lines = [
        "// ==UserScript==",
        "// @name         Xget Now",
        f"// @namespace    {metadata['homepage']}",
        f"// @version      {metadata['version']}",
        f"// @description  {metadata['description']}",
        f"// @author       {metadata['author']}",
        "// @license      GPL-3.0",
    ]

    metadata_lines.extend(f"// @match        {pattern}" for pattern in matches)
    metadata_lines.extend(
        [
            "// @grant        GM_getValue",
            "// @grant        GM_setValue",
            "// @grant        GM_deleteValue",
            "// @grant        GM_registerMenuCommand",
            "// @grant        GM_xmlhttpRequest",
            "// @connect      *",
            "// @run-at       document-start",
            "// ==/UserScript==",
            "",
        ]
    )

    script_parts = [
        "\n".join(metadata_lines),
        Path("src/shared/download-core.js").read_text(encoding="utf-8"),
        "",
        Path("src/userscript/index.js").read_text(encoding="utf-8"),
        "",
    ]

    output_path = build_dir / "xget-now.user.js"
    output_path.write_text("\n".join(script_parts), encoding="utf-8")

    print(f"Userscript 构建完成: {output_path}")
    return output_path


def validate_manifest(manifest_path, platform):
    """
    验证 manifest 文件格式和内容

    Args:
        manifest_path (str): manifest 文件路径
        platform (str): 目标平台名称 (chrome/firefox)

    Returns:
        bool: 验证是否通过
    """
    try:
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)

        if platform == "chrome":
            # 验证 Manifest V3 要求
            assert manifest.get("manifest_version") == 3, "Chrome 需要 Manifest V3"
            assert "action" in manifest, "Chrome 需要 action 字段"
            assert "service_worker" in manifest.get("background", {}), (
                "Chrome 需要 service_worker"
            )

        elif platform == "firefox":
            # 验证 Manifest V2 要求
            assert manifest.get("manifest_version") == 2, "Firefox 需要 Manifest V2"
            assert "browser_action" in manifest, "Firefox 需要 browser_action 字段"
            assert (
                "applications" in manifest or "browser_specific_settings" in manifest
            ), "Firefox 需要应用ID"

        print(f"✓ {platform} manifest 验证通过")
        return True

    except Exception as e:
        print(f"✗ {platform} manifest 验证失败: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="构建 Xget Now 扩展")
    parser.add_argument(
        "--platform",
        choices=["chrome", "firefox", "userscript", "all"],
        default="all",
        help="要构建的平台",
    )
    parser.add_argument("--package", action="store_true", help="创建扩展包")
    parser.add_argument(
        "--clean", action="store_true", default=True, help="清理构建目录"
    )

    args = parser.parse_args()

    platforms = []
    if args.platform == "all":
        platforms = ["chrome", "firefox", "userscript"]
    else:
        platforms = [args.platform]

    build_results = []

    for platform in platforms:
        try:
            if platform == "chrome":
                build_dir = build_chrome()
            elif platform == "firefox":
                build_dir = build_firefox()
            elif platform == "userscript":
                userscript_path = build_userscript()
                build_results.append((platform, userscript_path))
                if args.package:
                    create_userscript_package(userscript_path)
                continue

            # 验证 manifest
            manifest_path = build_dir / "manifest.json"
            if not validate_manifest(manifest_path, platform):
                continue

            build_results.append((platform, build_dir))

            # 创建扩展包
            if args.package:
                create_package(build_dir, platform)

        except Exception as e:
            print(f"构建 {platform} 时出错: {e}")

    # 总结
    print("\n构建总结:")
    for platform, build_dir in build_results:
        print(f"✓ {platform}: {build_dir}")

    if args.package:
        print("\n构建包位于 packages/ 目录")


if __name__ == "__main__":
    main()
