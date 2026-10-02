/**
 * scripts/package-zxp.js
 *
 * Smoothio を署名付きでパッケージングするスクリプト。
 *
 * 使い方:
 *   npm run package
 *
 * 出力:
 *   Release/Smoothio-vX.Y.Z.zxp  … ZXP インストーラ / UPIA 用
 *   Release/vX.Y.Z/src/          … 同じ署名済みの中身を展開したもの（インストーラ bat がこれをコピーする）
 *
 * 署名済みなので PlayerDebugMode なしで読み込まれる。
 * そのかわり、署名後に中身を1ファイルでも足す・書き換えると CEP に読み込まれなくなる。
 *
 * ZXPSignCmd は 4.1.3 以降が必要（それ以前は -tsa でクラッシュする）。
 * 場所は環境変数 ZXPSIGNCMD で指定できる（未指定なら ../../Tools/ZXP Tools/ZXPSignCmd.exe）。
 * 初回実行時に自己署名証明書 (certs/smoothio.p12) を自動生成します。
 * 証明書のパスワードは環境変数 SMOOTHIO_CERT_PASS で設定できます。
 */

const fs = require('fs')
const path = require('path')
const { execSync, execFileSync } = require('child_process')

// ─── Config ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..')
const ZXPSIGNCMD = process.env.ZXPSIGNCMD || path.resolve(ROOT, '..', '..', 'Tools', 'ZXP Tools', 'ZXPSignCmd.exe')
const CERT_DIR = path.join(ROOT, 'certs')
const CERT_FILE = path.join(CERT_DIR, 'smoothio.p12')
const CERT_PASS = process.env.SMOOTHIO_CERT_PASS
const TSA_URL = process.env.SMOOTHIO_TSA_URL || 'http://timestamp.digicert.com'
const EXT_DIR_NAME = 'src'   // the installer .bat looks for this folder
const STAGING_ROOT = path.join(ROOT, '.package-staging')
const STAGING_DIR = path.join(STAGING_ROOT, EXT_DIR_NAME)
const RELEASE_DIR = path.join(ROOT, 'Release')

// Files/directories to include in the ZXP (relative to project root)
const INCLUDE = [
  'CSXS',
  'dist',
  'host',
  'icons',
  'index.html',
  'popout.html',
  'settings.html',
  'LICENSE',
]

// Never ship these — an extra file breaks the signature
const SKIP = new Set(['node_modules', '.git', '.DS_Store', 'Thumbs.db', 'desktop.ini'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function copyRecursive(src, dst) {
  // statSync follows symlinks, so links are copied as real files (UPIA breaks symlinks in a ZXP)
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      if (SKIP.has(entry)) continue
      copyRecursive(path.join(src, entry), path.join(dst, entry))
    }
  } else if (stat.isFile()) {
    fs.copyFileSync(src, dst)
  }
}

function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  return pkg.version || '1.0.0'
}

function zxpSignCmd(args) {
  return execFileSync(ZXPSIGNCMD, args, { encoding: 'utf8' }).trim()
}

// .zxp is a plain zip; .NET extracts it whatever the extension (Expand-Archive insists on .zip)
function extractZip(zipPath, dstDir) {
  const q = (p) => `'${p.replace(/'/g, "''")}'`
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${q(zipPath)}, ${q(dstDir)})`,
  ], { stdio: 'inherit' })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const version = getVersion()
  const zxpFilename = `Smoothio-v${version}.zxp`

  console.log('📦 Smoothio ZXP Packager')
  console.log(`   Version: ${version}`)
  console.log('')

  if (!fs.existsSync(ZXPSIGNCMD)) {
    throw new Error(`ZXPSignCmd not found: ${ZXPSIGNCMD}\n   Set ZXPSIGNCMD to ZXPSignCmd.exe 4.1.3 or later.`)
  }

  // Step 1: Build
  console.log('🔨 Building...')
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })
  console.log('')

  // Step 2: Create certificate if needed
  if (!fs.existsSync(CERT_FILE)) {
    console.log('🔑 Creating self-signed certificate...')
    fs.mkdirSync(CERT_DIR, { recursive: true })
    zxpSignCmd(['-selfSignedCert', 'JP', 'Tokyo', 'Smoothio', 'Smoothio', CERT_PASS, CERT_FILE, '-validityDays', '3650'])
    console.log(`   ✅ Certificate created: certs/smoothio.p12`)
    console.log('')
  } else {
    console.log('🔑 Using existing certificate: certs/smoothio.p12')
    console.log('')
  }

  // Step 3: Stage files
  console.log('📁 Staging files...')
  rmrf(STAGING_ROOT)
  fs.mkdirSync(STAGING_DIR, { recursive: true })

  for (const item of INCLUDE) {
    const src = path.join(ROOT, item)
    const dst = path.join(STAGING_DIR, item)
    if (fs.existsSync(src)) {
      copyRecursive(src, dst)
      console.log(`   ✓ ${item}`)
    } else {
      console.warn(`   ⚠ ${item} not found, skipping`)
    }
  }
  console.log('')

  // Step 4: Sign & package (timestamped, so the signature outlives the certificate)
  console.log('✍️  Signing ZXP...')
  fs.mkdirSync(RELEASE_DIR, { recursive: true })
  const outputPath = path.join(RELEASE_DIR, zxpFilename)

  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)

  zxpSignCmd(['-sign', STAGING_DIR, outputPath, CERT_FILE, CERT_PASS, '-tsa', TSA_URL])
  console.log(zxpSignCmd(['-verify', outputPath, '-certinfo']))
  console.log('')

  // Step 5: Expand the signed package for the installer .bat
  console.log('📂 Expanding signed files...')
  const versionDir = path.join(RELEASE_DIR, `v${version}`)
  const extDir = path.join(versionDir, EXT_DIR_NAME)
  rmrf(extDir)
  fs.mkdirSync(versionDir, { recursive: true })
  extractZip(outputPath, extDir)
  console.log(`   ✓ Release/v${version}/${EXT_DIR_NAME}`)

  // Step 6: Cleanup
  rmrf(STAGING_ROOT)

  const stat = fs.statSync(outputPath)
  const sizeMB = (stat.size / 1024 / 1024).toFixed(2)

  console.log('')
  console.log('═══════════════════════════════════════════════')
  console.log(`  ✅ ${zxpFilename} (${sizeMB} MB)`)
  console.log(`  📂 ${RELEASE_DIR}`)
  console.log('═══════════════════════════════════════════════')
  console.log('')
  console.log('配布方法:')
  console.log(`  1. Release/v${version}/ にインストーラ bat を置き、v${version} の中身を Smoothio-v${version}.zip にまとめる`)
  console.log(`  2. ZXP インストーラを使う人には ${zxpFilename} を渡す`)
  console.log(`  ※ Release/v${version}/${EXT_DIR_NAME} の中身は変更しない（署名が壊れる）`)
  console.log('')
}

try {
  main()
} catch (err) {
  console.error('❌ Package failed:', err.message || err)
  rmrf(STAGING_ROOT)
  process.exit(1)
}
