const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const logoPath = path.join(__dirname, 'src', 'assets', 'logo.png');

// Android icon sizes (in pixels)
const androidSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// iOS icon sizes (in pixels)
const iosSizes = {
  '20x20@2x': 40,
  '20x20@3x': 60,
  '29x29@2x': 58,
  '29x29@3x': 87,
  '40x40@2x': 80,
  '40x40@3x': 120,
  '60x60@2x': 120,
  '60x60@3x': 180,
  '1024x1024': 1024,
};

async function generateAndroidIcons() {
  console.log('Generating Android icons...');
  const androidBasePath = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
  
  for (const [folder, size] of Object.entries(androidSizes)) {
    const folderPath = path.join(androidBasePath, folder);
    
    // Ensure folder exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    
    // Generate ic_launcher.png
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(folderPath, 'ic_launcher.png'));
    
    // Generate ic_launcher_round.png (same as regular for now)
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(folderPath, 'ic_launcher_round.png'));
    
    console.log(`  ✓ Generated ${folder}/ic_launcher.png (${size}x${size})`);
  }
}

async function generateIOSIcons() {
  console.log('Generating iOS icons...');
  const iosBasePath = path.join(__dirname, 'ios', 'DataLynkr', 'Images.xcassets', 'AppIcon.appiconset');
  
  // iOS icon filename mapping
  const iosIconFiles = {
    '20x20@2x': 'icon-20@2x.png',
    '20x20@3x': 'icon-20@3x.png',
    '29x29@2x': 'icon-29@2x.png',
    '29x29@3x': 'icon-29@3x.png',
    '40x40@2x': 'icon-40@2x.png',
    '40x40@3x': 'icon-40@3x.png',
    '60x60@2x': 'icon-60@2x.png',
    '60x60@3x': 'icon-60@3x.png',
    '1024x1024': 'icon-1024.png',
  };
  
  // Generate icons
  for (const [key, size] of Object.entries(iosSizes)) {
    const filename = iosIconFiles[key];
    const filepath = path.join(iosBasePath, filename);
    
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(filepath);
    
    console.log(`  ✓ Generated ${filename} (${size}x${size})`);
  }
  
  // Update Contents.json
  const contentsJson = {
    images: [
      {
        idiom: 'iphone',
        scale: '2x',
        size: '20x20',
        filename: 'icon-20@2x.png'
      },
      {
        idiom: 'iphone',
        scale: '3x',
        size: '20x20',
        filename: 'icon-20@3x.png'
      },
      {
        idiom: 'iphone',
        scale: '2x',
        size: '29x29',
        filename: 'icon-29@2x.png'
      },
      {
        idiom: 'iphone',
        scale: '3x',
        size: '29x29',
        filename: 'icon-29@3x.png'
      },
      {
        idiom: 'iphone',
        scale: '2x',
        size: '40x40',
        filename: 'icon-40@2x.png'
      },
      {
        idiom: 'iphone',
        scale: '3x',
        size: '40x40',
        filename: 'icon-40@3x.png'
      },
      {
        idiom: 'iphone',
        scale: '2x',
        size: '60x60',
        filename: 'icon-60@2x.png'
      },
      {
        idiom: 'iphone',
        scale: '3x',
        size: '60x60',
        filename: 'icon-60@3x.png'
      },
      {
        idiom: 'ios-marketing',
        scale: '1x',
        size: '1024x1024',
        filename: 'icon-1024.png'
      }
    ],
    info: {
      author: 'xcode',
      version: 1
    }
  };
  
  fs.writeFileSync(
    path.join(iosBasePath, 'Contents.json'),
    JSON.stringify(contentsJson, null, 2)
  );
  
  console.log('  ✓ Updated Contents.json');
}

async function main() {
  try {
    if (!fs.existsSync(logoPath)) {
      console.error(`Error: Logo file not found at ${logoPath}`);
      process.exit(1);
    }
    
    await generateAndroidIcons();
    await generateIOSIcons();
    
    console.log('\n✓ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

main();
