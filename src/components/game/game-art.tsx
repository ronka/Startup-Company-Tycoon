import { Image } from 'expo-image';

export const GAME_ART = {
  hq: require('../../../assets/images/game/hq.png'),
  team: require('../../../assets/images/game/team.png'),
  money: require('../../../assets/images/game/money.png'),
  market: require('../../../assets/images/game/market.png'),
};

export function GameArt({ name, size = 48 }: { name: keyof typeof GAME_ART; size?: number }) {
  return <Image source={GAME_ART[name]} contentFit="contain" style={{ width: size, height: size }} accessible={false} />;
}
