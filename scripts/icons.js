import sharp from 'sharp';
for (const size of [16, 32, 48, 128]) await sharp('extension/assets/avatar.png').resize(size, size).png().toFile(`extension/assets/avatar-${size}.png`);
console.log('Extension avatar icons: 16, 32, 48, 128');
