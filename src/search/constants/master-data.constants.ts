// ─────────────────────────────────────────────────────────────────────────────
// master-data.constants.ts
//
// In-memory master data for the F-Job Vietnamese casual labour marketplace.
// All arrays are exported as read-only tuples — zero DB round-trips required.
// These values deliberately mirror the job.schema enums (ExperienceLevel,
// CasualJobType) and the real province/district structure of Vietnam.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Industry {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
}

export interface District {
  id: string;
  name: string;
}

export interface Province {
  id: string;
  name: string;
  slug: string;
  region: 'north' | 'central' | 'south';
  districts: District[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
}

export interface Level {
  id: string;
  value: string;
  label: string;
}

export interface JobType {
  id: string;
  value: string;
  label: string;
}

// ─── Industries ───────────────────────────────────────────────────────────────

export const INDUSTRIES: readonly Industry[] = [
  {
    id: 'fnb',
    name: 'F&B',
    slug: 'fnb',
    icon: '🍜',
    description: 'Nhà hàng, quán cà phê, trà sữa, tiệm bánh và các dịch vụ ẩm thực',
  },
  {
    id: 'event',
    name: 'Sự kiện',
    slug: 'event',
    icon: '🎪',
    description: 'Tổ chức sự kiện, hội nghị, triển lãm, tiệc cưới và lễ hội',
  },
  {
    id: 'delivery',
    name: 'Giao hàng',
    slug: 'delivery',
    icon: '🛵',
    description: 'Giao hàng nhanh, shipper công nghệ và vận chuyển nội thành',
  },
  {
    id: 'warehouse',
    name: 'Kho vận',
    slug: 'warehouse',
    icon: '📦',
    description: 'Bốc xếp hàng hóa, kiểm kho, đóng gói và quản lý kho',
  },
  {
    id: 'retail',
    name: 'Bán lẻ',
    slug: 'retail',
    icon: '🛍️',
    description: 'Cửa hàng tạp hóa, siêu thị, shop thời trang và các điểm bán lẻ',
  },
  {
    id: 'promotion',
    name: 'Tiếp thị & Quảng cáo',
    slug: 'promotion',
    icon: '📣',
    description: 'PG/PB, phát tờ rơi, sampling, booth bán hàng và activation',
  },
  {
    id: 'cleaning',
    name: 'Vệ sinh & Tạp vụ',
    slug: 'cleaning',
    icon: '🧹',
    description: 'Vệ sinh văn phòng, khách sạn, hậu kỳ sự kiện và tòa nhà',
  },
  {
    id: 'security',
    name: 'Bảo vệ & An ninh',
    slug: 'security',
    icon: '🛡️',
    description: 'Bảo vệ tòa nhà, sự kiện và trật tự nơi công cộng',
  },
  {
    id: 'education',
    name: 'Gia sư & Giáo dục',
    slug: 'education',
    icon: '📚',
    description: 'Gia sư tại nhà, trợ giảng, trông trẻ và các hoạt động giáo dục',
  },
  {
    id: 'construction',
    name: 'Xây dựng & Thủ công',
    slug: 'construction',
    icon: '🔨',
    description: 'Thợ phụ xây dựng, sơn nhà, lắp đặt nội thất và sửa chữa',
  },
  {
    id: 'hospitality',
    name: 'Khách sạn & Du lịch',
    slug: 'hospitality',
    icon: '🏨',
    description: 'Lễ tân, phục vụ phòng, hướng dẫn viên du lịch và resort',
  },
  {
    id: 'other',
    name: 'Khác',
    slug: 'other',
    icon: '💼',
    description: 'Các ngành nghề lao động thời vụ và phổ thông khác',
  },
] as const;

// ─── Provinces & Districts ────────────────────────────────────────────────────

export const PROVINCES: readonly Province[] = [
  // ── South ──────────────────────────────────────────────────────────────────
  {
    id: 'hcm',
    name: 'Hồ Chí Minh',
    slug: 'ho-chi-minh',
    region: 'south',
    districts: [
      { id: 'hcm-q1',  name: 'Quận 1'         },
      { id: 'hcm-q3',  name: 'Quận 3'         },
      { id: 'hcm-q4',  name: 'Quận 4'         },
      { id: 'hcm-q5',  name: 'Quận 5'         },
      { id: 'hcm-q6',  name: 'Quận 6'         },
      { id: 'hcm-q7',  name: 'Quận 7'         },
      { id: 'hcm-q8',  name: 'Quận 8'         },
      { id: 'hcm-q10', name: 'Quận 10'        },
      { id: 'hcm-q11', name: 'Quận 11'        },
      { id: 'hcm-q12', name: 'Quận 12'        },
      { id: 'hcm-bc',  name: 'Bình Chánh'     },
      { id: 'hcm-bt',  name: 'Bình Tân'       },
      { id: 'hcm-bth', name: 'Bình Thạnh'     },
      { id: 'hcm-cc',  name: 'Củ Chi'         },
      { id: 'hcm-gv',  name: 'Gò Vấp'         },
      { id: 'hcm-hm',  name: 'Hóc Môn'        },
      { id: 'hcm-nhb', name: 'Nhà Bè'         },
      { id: 'hcm-pn',  name: 'Phú Nhuận'      },
      { id: 'hcm-tb',  name: 'Tân Bình'       },
      { id: 'hcm-tph', name: 'Tân Phú'        },
      { id: 'hcm-tp',  name: 'Thủ Đức'        },
    ],
  },
  {
    id: 'binhduong',
    name: 'Bình Dương',
    slug: 'binh-duong',
    region: 'south',
    districts: [
      { id: 'bd-td',  name: 'Thủ Dầu Một' },
      { id: 'bd-tl',  name: 'Thuận An'    },
      { id: 'bd-di',  name: 'Dĩ An'       },
      { id: 'bd-bp',  name: 'Bến Cát'     },
      { id: 'bd-pa',  name: 'Phú Giáo'    },
      { id: 'bd-bc',  name: 'Bàu Bàng'    },
    ],
  },
  {
    id: 'dongnai',
    name: 'Đồng Nai',
    slug: 'dong-nai',
    region: 'south',
    districts: [
      { id: 'dn-bh',  name: 'Biên Hòa'   },
      { id: 'dn-lk',  name: 'Long Khánh'  },
      { id: 'dn-xm',  name: 'Xuân Lộc'   },
      { id: 'dn-nh',  name: 'Nhơn Trạch' },
      { id: 'dn-tl',  name: 'Trảng Bom'  },
    ],
  },
  {
    id: 'vungtau',
    name: 'Bà Rịa - Vũng Tàu',
    slug: 'ba-ria-vung-tau',
    region: 'south',
    districts: [
      { id: 'brvt-vt', name: 'Vũng Tàu'  },
      { id: 'brvt-br', name: 'Bà Rịa'    },
      { id: 'brvt-ll', name: 'Long Đất'  },
      { id: 'brvt-xt', name: 'Xuyên Mộc' },
    ],
  },
  {
    id: 'cantho',
    name: 'Cần Thơ',
    slug: 'can-tho',
    region: 'south',
    districts: [
      { id: 'ct-nd', name: 'Ninh Kiều'  },
      { id: 'ct-bt', name: 'Bình Thủy'  },
      { id: 'ct-ck', name: 'Cái Răng'   },
      { id: 'ct-ok', name: 'Ô Môn'      },
      { id: 'ct-pd', name: 'Phong Điền' },
    ],
  },

  // ── Central ─────────────────────────────────────────────────────────────────
  {
    id: 'danang',
    name: 'Đà Nẵng',
    slug: 'da-nang',
    region: 'central',
    districts: [
      { id: 'dn-hc',  name: 'Hải Châu'   },
      { id: 'dn-tk',  name: 'Thanh Khê'  },
      { id: 'dn-ls',  name: 'Liên Chiểu' },
      { id: 'dn-sk',  name: 'Sơn Trà'    },
      { id: 'dn-nhs', name: 'Ngũ Hành Sơn' },
      { id: 'dn-cm',  name: 'Cẩm Lệ'    },
      { id: 'dn-hv',  name: 'Hòa Vang'   },
    ],
  },
  {
    id: 'hue',
    name: 'Huế',
    slug: 'hue',
    region: 'central',
    districts: [
      { id: 'hue-tp', name: 'TP Huế'      },
      { id: 'hue-hd', name: 'Hương Điền'  },
      { id: 'hue-pt', name: 'Phú Vang'    },
      { id: 'hue-htr',name: 'Hương Trà'   },
    ],
  },
  {
    id: 'quangnam',
    name: 'Quảng Nam',
    slug: 'quang-nam',
    region: 'central',
    districts: [
      { id: 'qna-tam',  name: 'Tam Kỳ'    },
      { id: 'qna-hian', name: 'Hội An'    },
      { id: 'qna-db',   name: 'Điện Bàn'  },
      { id: 'qna-duy',  name: 'Duy Xuyên' },
    ],
  },
  {
    id: 'khanhhoa',
    name: 'Khánh Hòa',
    slug: 'khanh-hoa',
    region: 'central',
    districts: [
      { id: 'kh-nt',  name: 'Nha Trang'  },
      { id: 'kh-cra', name: 'Cam Ranh'   },
      { id: 'kh-nl',  name: 'Ninh Lộc'   },
    ],
  },

  // ── North ───────────────────────────────────────────────────────────────────
  {
    id: 'hanoi',
    name: 'Hà Nội',
    slug: 'ha-noi',
    region: 'north',
    districts: [
      { id: 'hn-hk',  name: 'Hoàn Kiếm'    },
      { id: 'hn-dd',  name: 'Đống Đa'       },
      { id: 'hn-hai', name: 'Hai Bà Trưng'  },
      { id: 'hn-bd',  name: 'Ba Đình'       },
      { id: 'hn-cg',  name: 'Cầu Giấy'      },
      { id: 'hn-tl',  name: 'Tây Hồ'        },
      { id: 'hn-th',  name: 'Thanh Xuân'    },
      { id: 'hn-hm',  name: 'Hoàng Mai'     },
      { id: 'hn-lt',  name: 'Long Biên'     },
      { id: 'hn-nm',  name: 'Nam Từ Liêm'   },
      { id: 'hn-btl', name: 'Bắc Từ Liêm'  },
      { id: 'hn-hd',  name: 'Hà Đông'       },
      { id: 'hn-sd',  name: 'Sóc Sơn'       },
      { id: 'hn-glt', name: 'Gia Lâm'       },
    ],
  },
  {
    id: 'haiphong',
    name: 'Hải Phòng',
    slug: 'hai-phong',
    region: 'north',
    districts: [
      { id: 'hp-hb',  name: 'Hồng Bàng'  },
      { id: 'hp-lg',  name: 'Lê Chân'    },
      { id: 'hp-ng',  name: 'Ngô Quyền'  },
      { id: 'hp-kd',  name: 'Kiến An'    },
      { id: 'hp-dt',  name: 'Đồ Sơn'     },
      { id: 'hp-dh',  name: 'Dương Kinh' },
    ],
  },
  {
    id: 'quangninh',
    name: 'Quảng Ninh',
    slug: 'quang-ninh',
    region: 'north',
    districts: [
      { id: 'qn-hl', name: 'Hạ Long'   },
      { id: 'qn-cm', name: 'Cẩm Phả'   },
      { id: 'qn-ua', name: 'Uông Bí'   },
      { id: 'qn-mb', name: 'Móng Cái'  },
    ],
  },
] as const;

// ─── Skills ───────────────────────────────────────────────────────────────────

export const SKILLS: readonly Skill[] = [
  // F&B
  { id: 'pha-che',        name: 'Pha chế',             category: 'F&B'            },
  { id: 'phuc-vu',        name: 'Phục vụ bàn',         category: 'F&B'            },
  { id: 'bep-phu',        name: 'Bếp phụ',             category: 'F&B'            },
  { id: 'thu-ngan',       name: 'Thu ngân',             category: 'F&B'            },
  { id: 'giao-hang-fnb',  name: 'Giao hàng F&B',       category: 'F&B'            },

  // Event / Promotion
  { id: 'pg-pb',          name: 'PG/PB',               category: 'Sự kiện'        },
  { id: 'le-tan',         name: 'Lễ tân sự kiện',      category: 'Sự kiện'        },
  { id: 'mc-host',        name: 'MC / Dẫn chương trình',category: 'Sự kiện'       },
  { id: 'setup-event',    name: 'Setup / Hậu đài',     category: 'Sự kiện'        },
  { id: 'chup-anh',       name: 'Chụp ảnh / Quay phim',category: 'Sự kiện'       },

  // Delivery & Logistics
  { id: 'lai-xe-may',     name: 'Lái xe máy',          category: 'Giao hàng'      },
  { id: 'lai-xe-o-to',    name: 'Lái xe ô tô',         category: 'Giao hàng'      },
  { id: 'shipper',        name: 'Shipper công nghệ',   category: 'Giao hàng'      },
  { id: 'van-chuyen',     name: 'Vận chuyển hàng hóa', category: 'Kho vận'        },

  // Warehouse
  { id: 'boc-xep',        name: 'Bốc xếp hàng hóa',   category: 'Kho vận'        },
  { id: 'kiem-kho',       name: 'Kiểm kho / Kiểm hàng',category: 'Kho vận'       },
  { id: 'dong-goi',       name: 'Đóng gói sản phẩm',  category: 'Kho vận'        },
  { id: 'scan-barcode',   name: 'Scan barcode / WMS',  category: 'Kho vận'        },

  // Retail
  { id: 'ban-hang',       name: 'Bán hàng',            category: 'Bán lẻ'         },
  { id: 'trung-bay-hang', name: 'Trưng bày hàng hóa', category: 'Bán lẻ'         },
  { id: 'cham-soc-kh',    name: 'Chăm sóc khách hàng',category: 'Bán lẻ'         },

  // Cleaning
  { id: 've-sinh',        name: 'Vệ sinh công nghiệp', category: 'Vệ sinh'        },
  { id: 'tap-vu',         name: 'Tạp vụ',              category: 'Vệ sinh'        },

  // Security
  { id: 'bao-ve',         name: 'Bảo vệ',              category: 'Bảo vệ'         },

  // Construction / Manual
  { id: 'lao-dong-pho-thong', name: 'Lao động phổ thông', category: 'Xây dựng'  },
  { id: 'son-nha',        name: 'Sơn nhà',             category: 'Xây dựng'       },
  { id: 'may-mac',        name: 'May mặc / Công nhân', category: 'Xây dựng'       },

  // Education & Care
  { id: 'gia-su',         name: 'Gia sư',              category: 'Giáo dục'       },
  { id: 'trong-tre',      name: 'Trông trẻ / Osin',   category: 'Giáo dục'       },

  // Hospitality
  { id: 'buong-phong',    name: 'Buồng phòng khách sạn', category: 'Khách sạn'  },
  { id: 'huong-dan-vien', name: 'Hướng dẫn viên du lịch',category: 'Du lịch'    },
] as const;

// ─── Experience Levels ────────────────────────────────────────────────────────
// Derives from ExperienceLevel enum in job.schema.ts

export const LEVELS: readonly Level[] = [
  {
    id: 'none',
    value: 'No Experience',
    label: 'Không yêu cầu kinh nghiệm',
  },
  {
    id: 'under-6m',
    value: '< 6 Months',
    label: 'Dưới 6 tháng kinh nghiệm',
  },
  {
    id: 'above-6m',
    value: '> 6 Months',
    label: 'Trên 6 tháng kinh nghiệm',
  },
] as const;

// ─── Job Types ────────────────────────────────────────────────────────────────
// Derives from CasualJobType enum in job.schema.ts

export const JOB_TYPES: readonly JobType[] = [
  {
    id: 'part-time',
    value: 'Part-time',
    label: 'Bán thời gian',
  },
  {
    id: 'event',
    value: 'Event',
    label: 'Sự kiện / Gig',
  },
  {
    id: 'seasonal',
    value: 'Seasonal',
    label: 'Thời vụ / Theo mùa',
  },
] as const;
