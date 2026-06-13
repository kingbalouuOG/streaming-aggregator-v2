import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GLYPHS, type GlyphName } from '@/lib/constants/genreGlyphs';

// Native GenreIconTile — react-native-svg port of the web recipe
// (src/components/genreIcons.tsx): a tinted rounded square with a cream
// glyph and an offset orange "ghost" behind it. Same GLYPHS data as web.

interface GenreIconTileProps {
  glyph: GlyphName;
  size?: number;
  tile?: string;
}

export function GenreIconTile({ glyph, size = 40, tile = 'rgba(245,241,232,0.05)' }: GenreIconTileProps) {
  const def = GLYPHS[glyph];
  if (!def) return null;
  const offset = Math.max(1, Math.round(size * 0.04));
  const glyphSize = size * 0.5;
  const inset = (size - glyphSize) / 2;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: tile,
        borderWidth: 0.5,
        borderColor: 'rgba(245,241,232,0.10)',
        overflow: 'hidden',
      }}>
      {/* Orange ghost, offset down/right */}
      <Svg
        viewBox={def.viewBox}
        width={glyphSize}
        height={glyphSize}
        style={{ position: 'absolute', left: inset + offset, top: inset + offset }}>
        <Path d={def.d} fill="#e85d25" />
      </Svg>
      {/* Cream glyph on top */}
      <Svg
        viewBox={def.viewBox}
        width={glyphSize}
        height={glyphSize}
        style={{ position: 'absolute', left: inset, top: inset }}>
        <Path d={def.d} fill="#f5f1e8" />
      </Svg>
    </View>
  );
}
