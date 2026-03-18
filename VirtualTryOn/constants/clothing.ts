export const CLOTHING_ITEMS: Array<{
  id: string;
  name: string;
  price: string;
  cloth_type: 'upper' | 'lower' | 'overall';
  image: number | string;
}> = [
  { id: 'guest-kurti-women', name: 'Kurti (Women)', price: '', cloth_type: 'overall', image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771768714/kurti_women_ytygwx.jpg' },
  { id: 'guest-sherwani', name: 'Sherwani', price: '', cloth_type: 'overall', image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771768713/sherwani_jpgvcq.webp' },
  { id: 'guest-saree', name: 'Saree', price: '', cloth_type: 'overall', image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771840121/saree_rij9l4.webp' },
  { id: 'guest-kurta-men', name: 'Kurta (Men)', price: '', cloth_type: 'overall', image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771839832/kurta_men_lyhzmt.webp' },
  { id: 'guest-full-suit', name: 'Full Suit', price: '', cloth_type: 'overall', image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771769079/full_suit_xe1twn.png' },
];

export function getClothingById(id: string) {
  return CLOTHING_ITEMS.find((item) => item.id === id) ?? CLOTHING_ITEMS[0];
}
