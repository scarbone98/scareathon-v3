// What the ticket counter sells for the cryptlin in the cellar. `id` is the game's own id for
// the thing (Cryptlins: scripts/items.gd); a bone, the ball, the rag nest, a dirt floor, the
// notebook and the scanner come free and aren't sold. `keeps`: bought once and kept. The rest
// are eaten, and come `pack` to a purchase.

export const CRYPTLINS_ITEMS = [
    { id: 'toadstool', name: 'Toadstools', group: 'Food', price: 15, pack: 5, blurb: 'Red with white spots. Some swear by them.' },
    { id: 'candy', name: 'Candy corn', group: 'Food', price: 20, pack: 5, blurb: 'Three stripes of sugar.' },
    { id: 'fish', name: 'Fish', group: 'Food', price: 25, pack: 5, blurb: 'Fresh this week.' },
    { id: 'beetle', name: 'Beetles', group: 'Food', price: 20, pack: 5, blurb: 'Crunchy, and still a bit lively.' },
    { id: 'berries', name: 'Berries', group: 'Food', price: 20, pack: 5, blurb: 'A handful, dark and sweet.' },
    { id: 'stone', name: 'Stone', group: 'Toy', price: 40, keeps: true, blurb: 'Heavy. It thuds more than it bounces.' },
    { id: 'bell', name: 'Bell', group: 'Toy', price: 80, keeps: true, blurb: 'A brass ball that rings when it lands.' },
    { id: 'glow', name: 'Glow orb', group: 'Toy', price: 120, keeps: true, blurb: 'Floats down slowly, and shines in the dark.' },
    { id: 'rock', name: 'Rock', group: 'Decor', price: 40, keeps: true, blurb: 'Something to climb up and sit on.' },
    { id: 'log', name: 'Hollow log', group: 'Decor', price: 60, keeps: true, blurb: 'Bark, moss and a dark middle.' },
    { id: 'fern', name: 'Fern', group: 'Decor', price: 50, keeps: true, blurb: 'It grows without much light.' },
    { id: 'skull', name: 'Skull', group: 'Decor', price: 80, keeps: true, blurb: 'Horned. Nobody knows what of.' },
    { id: 'crystal', name: 'Crystal', group: 'Decor', price: 120, keeps: true, blurb: 'A cluster that gives off its own light.' },
    { id: 'pumpkin', name: 'Pumpkin', group: 'Decor', price: 70, keeps: true, blurb: 'Carved, with a candle in.' },
    { id: 'gravestone', name: 'Gravestone', group: 'Decor', price: 90, keeps: true, blurb: 'Nobody under it. Probably.' },
    { id: 'dish', name: 'Water dish', group: 'Decor', price: 50, keeps: true, blurb: 'Something to drink from.' },
    { id: 'cave', name: 'Cave', group: 'Decor', price: 150, keeps: true, blurb: 'Boulders leant together. Room inside for one.' },
    { id: 'pool', name: 'Pool', group: 'Decor', price: 60, keeps: true, blurb: 'Deep enough to wade in. The water kinds pine without one.' },
    { id: 'barrel', name: 'Barrel', group: 'Decor', price: 90, keeps: true, blurb: 'On its side, with the end knocked out.' },
    { id: 'stump', name: 'Hollow stump', group: 'Decor', price: 80, keeps: true, blurb: 'Rotten through the middle, which is the point.' },
    { id: 'tent', name: 'Rag tent', group: 'Decor', price: 70, keeps: true, blurb: 'Rags over sticks. Somewhere to not be looked at.' },
    { id: 'crate', name: 'Crate', group: 'Decor', price: 60, keeps: true, blurb: 'A wooden box with a hole in the front.' },
    { id: 'pot', name: 'Flowerpot', group: 'Decor', price: 50, keeps: true, blurb: 'A big cracked one, lying on its side.' },
    { id: 'twigs', name: 'Twig nest', group: 'Nest', price: 60, keeps: true, blurb: 'A bird\'s nest, lined with straw.' },
    { id: 'cushion', name: 'Cushion', group: 'Nest', price: 100, keeps: true, blurb: 'Plum velvet with a tassel at each corner.' },
    { id: 'box', name: 'Cardboard box', group: 'Nest', price: 30, keeps: true, blurb: 'The best bed there is, to some.' },
    { id: 'flagstones', name: 'Flagstones', group: 'Floor', price: 60, keeps: true, blurb: 'Worn stone slabs.' },
    { id: 'floorboards', name: 'Floorboards', group: 'Floor', price: 60, keeps: true, blurb: 'Old boards with a knot or two.' },
    { id: 'moss', name: 'Moss', group: 'Floor', price: 80, keeps: true, blurb: 'Soft and green, with the odd flower.' },
    { id: 'checkers', name: 'Checkered tiles', group: 'Floor', price: 80, keeps: true, blurb: 'Black and white, a few chipped.' },
    { id: 'sand', name: 'Sand', group: 'Floor', price: 60, keeps: true, blurb: 'Raked into ripples.' },
    { id: 'gravel', name: 'Gravel', group: 'Floor', price: 60, keeps: true, blurb: 'Small stones, packed down.' },
];
