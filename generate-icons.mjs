import sharp from 'sharp'

const BG = { r: 8, g: 16, b: 30, alpha: 1 } // couleur de fond = --bg de l'app

const sizes = [
  { size: 192,  file: 'public/icons/icon-192.png' },
  { size: 512,  file: 'public/icons/icon-512.png' },
  { size: 180,  file: 'public/icons/apple-touch-icon.png' },
  { size: 32,   file: 'public/favicon.ico' },
]

for (const { size, file } of sizes) {
  await sharp('public/icons/logo.png')
    .resize(size, size, { fit: 'contain', background: BG })
    .png()
    .toFile(file)
  console.log(`✓ ${file} (${size}×${size})`)
}

console.log('Icônes générées.')
