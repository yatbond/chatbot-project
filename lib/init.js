import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// Ensure lib directory exists
const libDir = join(process.cwd(), 'lib')
if (!existsSync(libDir)) {
  mkdirSync(libDir, { recursive: true })
}

// Create placeholder files to ensure directory structure
writeFileSync(join(libDir, '.gitkeep'), '')
