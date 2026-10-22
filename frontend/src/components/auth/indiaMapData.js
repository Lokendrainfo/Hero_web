/**
 * India Telecom Network Map Data
 * Geographic boundary path (normalized to 1000x1150 coordinate space)
 * and strategic telecom nodes with optical fiber interconnect routes.
 */

export const INDIA_MAP_BOUNDS = {
  viewWidth: 1000,
  viewHeight: 1150,
  minLon: 67.5,
  maxLon: 98.0,
  minLat: 7.0,
  maxLat: 38.0
};

export const projectLonLat = (lon, lat) => {
  const x = ((lon - INDIA_MAP_BOUNDS.minLon) / (INDIA_MAP_BOUNDS.maxLon - INDIA_MAP_BOUNDS.minLon)) * 960 + 20;
  const y = ((INDIA_MAP_BOUNDS.maxLat - lat) / (INDIA_MAP_BOUNDS.maxLat - INDIA_MAP_BOUNDS.minLat)) * 1100 + 25;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
};

// Exact Catmull-Rom smoothed path of India boundary
export const INDIA_BOUNDARY_PATH = "M 312.7 56.9 C 326.3 55.1, 333.2 88.3, 344.2 103.1 C 355.2 117.9, 371.4 133.2, 378.8 145.6 C 386.2 158.0, 390.4 165.2, 388.3 177.6 C 386.2 190.0, 367.3 209.0, 366.2 220.2 C 365.1 231.4, 372.6 234.9, 382 245 C 391.4 255.1, 413.5 270.4, 422.9 280.5 C 432.3 290.6, 433.9 293.5, 438.6 305.3 C 443.3 317.1, 442.3 340.3, 451.2 351.5 C 460.1 362.7, 477.4 365.0, 492.1 372.7 C 506.8 380.4, 523.5 389.3, 539.3 397.6 C 555.0 405.9, 570.9 417.1, 586.6 422.4 C 602.4 427.7, 620.2 429.5, 633.8 429.5 C 647.4 429.5, 662.6 428.3, 668.4 422.4 C 674.2 416.5, 665.8 401.7, 668.4 394 C 671.0 386.3, 680.4 375.1, 684.1 376.3 C 687.8 377.5, 685.7 394.0, 690.4 401.1 C 695.1 408.2, 698.3 416.5, 712.5 418.9 C 726.7 421.3, 762.3 420.6, 775.4 415.3 C 788.5 410.0, 780.6 395.2, 791.1 386.9 C 801.6 378.6, 822.6 372.7, 838.4 365.6 C 854.1 358.5, 870.4 346.8, 885.6 344.4 C 900.8 342.0, 917.5 346.2, 929.6 351.5 C 941.7 356.8, 955.9 367.4, 958 376.3 C 960.1 385.2, 952.7 397.0, 942.2 404.7 C 931.7 412.4, 906.5 413.5, 895 422.4 C 883.5 431.3, 877.7 444.3, 873 457.9 C 868.3 471.5, 872.5 490.4, 866.7 504 C 860.9 517.6, 845.2 525.3, 838.4 539.5 C 831.6 553.7, 831.0 585.1, 825.8 589.2 C 820.5 593.4, 812.7 575.0, 806.9 564.4 C 801.1 553.8, 797.4 530.6, 791.1 525.3 C 784.8 520.0, 770.1 536.5, 769.1 532.4 C 768.1 528.3, 779.1 508.8, 784.9 500.5 C 790.7 492.2, 807.9 486.3, 803.7 482.7 C 799.5 479.1, 772.8 483.3, 759.7 479.2 C 746.6 475.1, 736.0 457.3, 725 457.9 C 714.0 458.5, 702.0 473.8, 693.6 482.7 C 685.2 491.6, 674.7 499.9, 674.7 511.1 C 674.7 522.4, 689.4 535.4, 693.6 550.2 C 697.8 565.0, 704.6 590.9, 699.9 599.8 C 695.2 608.7, 674.7 601.6, 665.2 603.4 C 655.8 605.2, 650.5 602.2, 643.2 610.5 C 635.9 618.8, 629.1 643.1, 621.2 653.1 C 613.3 663.1, 604.9 663.7, 596 670.8 C 587.1 677.9, 580.8 683.2, 567.7 695.6 C 554.6 708.0, 531.5 732.3, 517.3 745.3 C 503.1 758.3, 494.2 764.2, 482.7 773.7 C 471.2 783.2, 459.1 792.6, 448.1 802.1 C 437.1 811.6, 422.4 819.3, 416.6 830.5 C 410.8 841.7, 412.3 856.5, 413.4 869.5 C 414.4 882.5, 423.9 894.9, 422.9 908.5 C 421.8 922.1, 409.7 935.7, 407.1 951.1 C 404.5 966.5, 409.7 985.4, 407.1 1000.8 C 404.5 1016.2, 399.8 1032.8, 391.4 1043.4 C 383.0 1054.1, 366.0 1057.5, 356.8 1064.7 C 347.6 1071.9, 342.6 1085.5, 336.3 1086.7 C 330.0 1087.9, 324.0 1076.7, 319 1071.8 C 314.0 1066.9, 310.1 1066.5, 306.4 1057.6 C 302.7 1048.7, 301.2 1032.1, 297 1018.5 C 292.8 1004.9, 285.9 987.2, 281.2 976 C 276.5 964.8, 273.9 961.2, 268.7 951.1 C 263.5 941.0, 256.6 932.8, 249.8 915.6 C 243.0 898.5, 232.9 863.6, 227.7 848.2 C 222.4 832.8, 222.5 835.8, 218.3 823.4 C 214.1 811.0, 207.6 794.4, 202.6 773.7 C 197.6 753.0, 191.0 719.9, 188.4 699.2 C 185.8 678.5, 187.1 662.5, 186.8 649.5 C 186.5 636.5, 190.0 628.2, 186.8 621.1 C 183.7 614.0, 177.3 603.9, 167.9 606.9 C 158.5 609.9, 139.6 634.8, 130.2 638.9 C 120.8 643.0, 118.6 637.1, 111.3 631.8 C 104.0 626.5, 93.4 614.6, 86.1 606.9 C 78.8 599.2, 66.2 592.7, 67.2 585.6 C 68.3 578.5, 95.0 573.3, 92.4 564.4 C 89.8 555.5, 59.9 540.7, 51.5 532.4 C 43.1 524.1, 31.5 525.4, 42 514.7 C 52.5 504.1, 103.9 483.9, 114.4 468.5 C 124.9 453.1, 102.4 436.0, 105 422.4 C 107.6 408.8, 118.1 397.5, 130.2 386.9 C 142.3 376.3, 162.2 370.9, 177.4 358.5 C 192.6 346.1, 210.4 326.0, 221.4 312.4 C 232.4 298.8, 238.8 286.9, 243.5 276.9 C 248.2 266.8, 247.7 261.0, 249.8 252.1 C 251.9 243.2, 256.1 230.8, 256.1 223.7 C 256.1 216.6, 254.0 216.6, 249.8 209.5 C 245.6 202.4, 234.6 191.2, 230.9 181.1 C 227.2 171.0, 222.4 160.4, 227.7 149.2 C 232.9 138.0, 248.2 129.1, 262.4 113.7 C 276.6 98.3, 299.1 58.7, 312.7 56.9 Z";

export const SRI_LANKA_PATH = "M 413.4 1025.6 C 417.1 1021.4, 419.8 1039.2, 429.2 1046.9 C 438.6 1054.6, 463.3 1060.0, 470.1 1071.8 C 476.9 1083.6, 474.3 1103.1, 470.1 1117.9 C 465.9 1132.7, 453.3 1153.4, 444.9 1160.5 C 436.5 1167.6, 426.0 1167.6, 419.7 1160.5 C 413.4 1153.4, 409.2 1132.7, 407.1 1117.9 C 405.0 1103.1, 406.1 1087.2, 407.1 1071.8 C 408.2 1056.4, 409.7 1029.8, 413.4 1025.6 Z";

// Strategic telecom nodes across all regions
export const TELECOM_NODES = [
  // Tier 1 National Gateways & Landing Stations
  { id: 'DEL', name: 'Delhi NCR', lon: 77.2090, lat: 28.6139, tier: 1, region: 'NORTH' },
  { id: 'MUM', name: 'Mumbai', lon: 72.8777, lat: 19.0760, tier: 1, region: 'WEST', landing: true },
  { id: 'BLR', name: 'Bengaluru', lon: 77.5946, lat: 12.9716, tier: 1, region: 'SOUTH' },
  { id: 'HYD', name: 'Hyderabad', lon: 78.4867, lat: 17.3850, tier: 1, region: 'SOUTH' },
  { id: 'MAA', name: 'Chennai', lon: 80.2707, lat: 13.0827, tier: 1, region: 'SOUTH', landing: true },
  { id: 'CCU', name: 'Kolkata', lon: 88.3639, lat: 22.5726, tier: 1, region: 'EAST' },

  // Tier 2 Regional Telecom Circle Hubs
  { id: 'AMD', name: 'Ahmedabad', lon: 72.5714, lat: 23.0225, tier: 2, region: 'WEST' },
  { id: 'PNQ', name: 'Pune', lon: 73.8567, lat: 18.5204, tier: 2, region: 'WEST' },
  { id: 'JAI', name: 'Jaipur', lon: 75.7873, lat: 26.9124, tier: 2, region: 'NORTH' },
  { id: 'LKO', name: 'Lucknow', lon: 80.9462, lat: 26.8467, tier: 2, region: 'NORTH' },
  { id: 'IXC', name: 'Chandigarh', lon: 76.7794, lat: 30.7333, tier: 2, region: 'NORTH' },
  { id: 'PAT', name: 'Patna', lon: 85.1376, lat: 25.5941, tier: 2, region: 'EAST' },
  { id: 'BBI', name: 'Bhubaneswar', lon: 85.8245, lat: 20.2961, tier: 2, region: 'EAST' },
  { id: 'NAG', name: 'Nagpur', lon: 79.0882, lat: 21.1458, tier: 2, region: 'CENTRAL' },
  { id: 'BHO', name: 'Bhopal', lon: 77.4126, lat: 23.2599, tier: 2, region: 'CENTRAL' },
  { id: 'IDR', name: 'Indore', lon: 75.8577, lat: 22.7196, tier: 2, region: 'CENTRAL' },
  { id: 'COK', name: 'Kochi', lon: 76.2673, lat: 9.9312, tier: 2, region: 'SOUTH', landing: true },
  { id: 'GAU', name: 'Guwahati', lon: 91.7362, lat: 26.1445, tier: 2, region: 'NORTHEAST' },
  { id: 'VTZ', name: 'Visakhapatnam', lon: 83.2185, lat: 17.6868, tier: 2, region: 'SOUTH', landing: true },
  { id: 'VGA', name: 'Vijayawada', lon: 80.6480, lat: 16.5062, tier: 2, region: 'SOUTH' },
  { id: 'CJB', name: 'Coimbatore', lon: 76.9558, lat: 11.0168, tier: 2, region: 'SOUTH' },
  { id: 'TRV', name: 'Thiruvananthapuram', lon: 76.9366, lat: 8.5241, tier: 2, region: 'SOUTH' },
  { id: 'IXR', name: 'Ranchi', lon: 85.3096, lat: 23.3441, tier: 2, region: 'EAST' },
  { id: 'RPR', name: 'Raipur', lon: 81.6296, lat: 21.2514, tier: 2, region: 'CENTRAL' },
  { id: 'SXR', name: 'Srinagar', lon: 74.7973, lat: 34.0837, tier: 2, region: 'NORTH' },
  { id: 'IXJ', name: 'Jammu', lon: 74.8570, lat: 32.7266, tier: 2, region: 'NORTH' },
  { id: 'DED', name: 'Dehradun', lon: 78.0322, lat: 30.3165, tier: 2, region: 'NORTH' },
  { id: 'STV', name: 'Surat', lon: 72.8311, lat: 21.1702, tier: 2, region: 'WEST' },
  { id: 'GOI', name: 'Goa', lon: 73.8180, lat: 15.4909, tier: 2, region: 'WEST' },
  { id: 'IXB', name: 'Siliguri', lon: 88.3953, lat: 26.7271, tier: 2, region: 'EAST' },
  { id: 'JDH', name: 'Jodhpur', lon: 73.0243, lat: 26.2389, tier: 2, region: 'NORTH' },
  { id: 'BKN', name: 'Bikaner', lon: 73.3119, lat: 28.0229, tier: 2, region: 'NORTH' },
  { id: 'VNS', name: 'Varanasi', lon: 82.9739, lat: 25.3176, tier: 2, region: 'NORTH' },
  { id: 'KNU', name: 'Kanpur', lon: 80.3319, lat: 26.4499, tier: 2, region: 'NORTH' },
  { id: 'IXA', name: 'Agartala', lon: 91.2868, lat: 23.8315, tier: 3, region: 'NORTHEAST' },
  { id: 'SHL', name: 'Shillong', lon: 91.8933, lat: 25.5788, tier: 3, region: 'NORTHEAST' },
  { id: 'IMF', name: 'Imphal', lon: 93.9368, lat: 24.8170, tier: 3, region: 'NORTHEAST' },
  { id: 'IXZ', name: 'Port Blair', lon: 92.7265, lat: 11.6234, tier: 3, region: 'ISLAND', subsea: true },
  { id: 'IXL', name: 'Leh', lon: 77.5771, lat: 34.1526, tier: 3, region: 'NORTH' },
  { id: 'MDU', name: 'Madurai', lon: 78.1198, lat: 9.9252, tier: 3, region: 'SOUTH' },
  { id: 'SLV', name: 'Shimla', lon: 77.1734, lat: 31.1048, tier: 3, region: 'NORTH' }
].map(n => {
  const [x, y] = projectLonLat(n.lon, n.lat);
  return { ...n, x, y };
});

export const FIBER_LINKS = [
  // Golden Quadrilateral & National Super-Highways
  ['DEL', 'JAI'], ['JAI', 'AMD'], ['AMD', 'STV'], ['STV', 'MUM'],
  ['MUM', 'PNQ'], ['PNQ', 'BLR'], ['BLR', 'MAA'],
  ['MAA', 'VGA'], ['VGA', 'VTZ'], ['VTZ', 'BBI'], ['BBI', 'CCU'],
  ['CCU', 'PAT'], ['PAT', 'VNS'], ['VNS', 'KNU'], ['KNU', 'LKO'], ['LKO', 'DEL'],

  // Central Cross-Connections
  ['DEL', 'BHO'], ['BHO', 'NAG'], ['NAG', 'HYD'], ['HYD', 'BLR'],
  ['MUM', 'NAG'], ['NAG', 'RPR'], ['RPR', 'IXR'], ['IXR', 'CCU'],
  ['AMD', 'IDR'], ['IDR', 'BHO'], ['MUM', 'IDR'],
  ['HYD', 'VGA'], ['PNQ', 'HYD'], ['BLR', 'HYD'],

  // Northern Extensions
  ['DEL', 'IXC'], ['IXC', 'SLV'], ['IXC', 'IXJ'], ['IXJ', 'SXR'], ['SXR', 'IXL'],
  ['DEL', 'DED'], ['DEL', 'KNU'], ['JAI', 'JDH'], ['JDH', 'BKN'], ['BKN', 'DEL'],

  // Southern Coastal & Peninsula Grid
  ['BLR', 'CJB'], ['CJB', 'COK'], ['COK', 'TRV'], ['TRV', 'MDU'], ['MDU', 'MAA'],
  ['MUM', 'GOI'], ['GOI', 'BLR'], ['GOI', 'COK'],
  ['MAA', 'IXZ'], // Subsea cable link

  // Eastern & Northeast Corridors
  ['CCU', 'IXB'], ['IXB', 'GAU'], ['GAU', 'SHL'], ['SHL', 'IXA'],
  ['GAU', 'IMF'], ['PAT', 'IXR'], ['BBI', 'RPR']
];

export const NODE_DICT = TELECOM_NODES.reduce((acc, n) => {
  acc[n.id] = n;
  return acc;
}, {});
