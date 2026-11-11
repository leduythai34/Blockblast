/**
 * AR BLOCK BLAST - Hand Gesture Controlled (8x8 Grid + Solvable Piece Generator)
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.getElementById('webcam');

const scoreEl = document.getElementById('scoreValue');
const bestScoreEl = document.getElementById('bestScoreValue');
const comboEl = document.getElementById('comboValue');
const statusTextEl = document.getElementById('statusText');
const camDotEl = document.getElementById('camDot');
const toggleCameraBgEl = document.getElementById('toggleCameraBg');
const resetBtn = document.getElementById('resetBtn');

// --- CẤU HÌNH BẢNG & KHỐI ---
const GRID_SIZE = 8;
let board = []; // 8x8 lưu màu hoặc null
let score = 0;
let bestScore = Number(localStorage.getItem('ar_blockblast_best') || 0);
let combo = 0;
bestScoreEl.textContent = bestScore;

// Danh sách các hình dạng khối trong Block Blast (tọa độ [r, c])
const SHAPES = [
  // Đơn & Thanh ngang/dọc
  { name: '1x1', cells: [[0, 0]], color: '#38bdf8' },
  { name: '1x2', cells: [[0, 0], [0, 1]], color: '#60a5fa' },
  { name: '2x1', cells: [[0, 0], [1, 0]], color: '#60a5fa' },
  { name: '1x3', cells: [[0, 0], [0, 1], [0, 2]], color: '#34d399' },
  { name: '3x1', cells: [[0, 0], [1, 0], [2, 0]], color: '#34d399' },
  { name: '1x4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], color: '#a78bfa' },
  { name: '4x1', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: '#a78bfa' },
  { name: '1x5', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], color: '#f472b6' },
  { name: '5x1', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], color: '#f472b6' },

  // Ô vuông
  { name: '2x2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: '#fbbf24' },
  {
    name: '3x3',
    cells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2]
    ],
    color: '#f97316'
  },

  // Chữ L nhỏ (3 ô)
  { name: 'L3_1', cells: [[0, 0], [1, 0], [1, 1]], color: '#fb7185' },
  { name: 'L3_2', cells: [[0, 0], [0, 1], [1, 0]], color: '#fb7185' },
  { name: 'L3_3', cells: [[0, 0], [0, 1], [1, 1]], color: '#fb7185' },
  { name: 'L3_4', cells: [[0, 1], [1, 0], [1, 1]], color: '#fb7185' },

  // Chữ L lớn (5 ô - 3x3 góc)
  { name: 'L5_1', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], color: '#f43f5e' },
  { name: 'L5_2', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], color: '#f43f5e' },
  { name: 'L5_3', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], color: '#f43f5e' },
  { name: 'L5_4', cells: [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]], color: '#f43f5e' },

  // Chữ T & Z (4 ô)
  { name: 'T4_1', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], color: '#c084fc' },
  { name: 'T4_2', cells: [[0, 1], [1, 0], [1, 1], [1, 2]], color: '#c084fc' },
  { name: 'Z4_1', cells: [[0, 0], [0, 1], [1, 1], [1, 2]], color: '#4ade80' },
  { name: 'Z4_2', cells: [[0, 1], [0, 2], [1, 0], [1, 1]], color: '#4ade80' }
];

// --- TRẠNG THÁI KHỐI DỰ BỊ & KÉO THẢ ---
let trayPieces = []; // 3 khối bên phải/dưới
let grabbedPieceIndex = -1;
let dragPos = { x: 0, y: 0 }; // Vị trí tâm khối đang kéo

// Hiệu ứng nổ hàng/cột & chữ nổi
let particles = [];
let floatingTexts = [];
let cellFlashAnimations = []; // Hiệu ứng sáng ô vừa đặt hoặc xóa

// --- TRẠNG THÁI CAMERA & BÀN TAY ---
let handState = {
  detected: false,
  thumbTip: { x: 0, y: 0 },
  indexTip: { x: 0, y: 0 },
  pinchPoint: { x: 0, y: 0 }, // Trung điểm ngón cái & ngón trỏ (đã làm mượt)
  rawPinchDist: 999,
  isPinching: false,
  wasPinching: false,
  landmarks: null
};

// Bộ lọc làm mượt tọa độ tay (Tăng lên cao để phản hồi tức thì, không bị trễ)
const SMOOTH_FACTOR = 0.78;

// Layout tính toán theo kích thước màn hình
let layout = {
  boardX: 0,
  boardY: 0,
  boardSize: 0,
  cellSize: 0,
  traySlots: [] // [{x, y, width, height}]
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  computeLayout();
}
window.addEventListener('resize', resizeCanvas);

function computeLayout() {
  const w = canvas.width;
  const h = canvas.height;
  const topSpace = 90;
  const bottomSpace = 75;
  const availH = h - topSpace - bottomSpace;

  // Bảng 8x8 nằm bên trái-giữa, khay 3 khối nằm bên phải để tay phải/trái dễ gắp
  const maxBoardSize = Math.min(availH * 0.92, w * 0.56);
  const cellSize = Math.floor(maxBoardSize / GRID_SIZE);
  const boardSize = cellSize * GRID_SIZE;

  const totalContentWidth = boardSize + Math.min(280, w * 0.28);
  const startX = Math.max(24, (w - totalContentWidth) / 2);
  const boardX = startX;
  const boardY = topSpace + (availH - boardSize) / 2;

  const trayX = boardX + boardSize + Math.max(28, w * 0.035);
  const trayWidth = Math.min(250, w - trayX - 24);
  const slotHeight = boardSize / 3;

  const traySlots = [];
  for (let i = 0; i < 3; i++) {
    traySlots.push({
      x: trayX,
      y: boardY + i * slotHeight,
      width: trayWidth,
      height: slotHeight - 12,
      centerX: trayX + trayWidth / 2,
      centerY: boardY + i * slotHeight + (slotHeight - 12) / 2
    });
  }

  layout = { boardX, boardY, boardSize, cellSize, traySlots };
}

// --- LOGIC BẢNG & KIỂM TRA HỢP LỆ ---
function createEmptyBoard() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function cloneBoard(b) {
  return b.map(row => [...row]);
}

function getShapeBounds(cells) {
  let maxR = 0, maxC = 0;
  for (const [r, c] of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { rows: maxR + 1, cols: maxC + 1 };
}

function canPlaceShape(targetBoard, shape, startR, startC) {
  for (const [dr, dc] of shape.cells) {
    const r = startR + dr;
    const c = startC + dc;
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    if (targetBoard[r][c] !== null) return false;
  }
  return true;
}

function simulatePlaceAndClear(targetBoard, shape, startR, startC) {
  const nextB = cloneBoard(targetBoard);
  for (const [dr, dc] of shape.cells) {
    nextB[startR + dr][startC + dc] = shape.color;
  }

  const fullRows = [];
  const fullCols = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    if (nextB[r].every(cell => cell !== null)) fullRows.push(r);
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    let full = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (nextB[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) fullCols.push(c);
  }

  for (const r of fullRows) {
    for (let c = 0; c < GRID_SIZE; c++) nextB[r][c] = null;
  }
  for (const c of fullCols) {
    for (let r = 0; r < GRID_SIZE; r++) nextB[r][c] = null;
  }

  return {
    board: nextB,
    clearedCount: fullRows.length + fullCols.length,
    fullRows,
    fullCols
  };
}

/**
 * Tìm mọi vị trí hợp lệ cho 1 shape trên bảng
 * Ưu tiên các vị trí giúp xóa được hàng/cột để tạo trải nghiệm thông minh
 */
function findAllValidPlacements(targetBoard, shape) {
  const placements = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (canPlaceShape(targetBoard, shape, r, c)) {
        const sim = simulatePlaceAndClear(targetBoard, shape, r, c);
        placements.push({ r, c, clearedCount: sim.clearedCount, nextBoard: sim.board });
      }
    }
  }
  return placements;
}

/**
 * THUẬT TOÁN SINH 3 KHỐI LUÔN CÓ CÁCH SẮP XẾP HỢP LÝ VỚI BẢNG
 * Mô phỏng chuỗi đặt 3 khối liên tiếp (tính cả việc xóa hàng/cột giữa chừng)
 * đảm bảo người chơi luôn có ít nhất 1 thứ tự xếp được cả 3 khối lên bảng!
 */
function generateSolvableTray() {
  let simBoard = cloneBoard(board);
  const chosenShapes = [];

  for (let i = 0; i < 3; i++) {
    // Trộn ngẫu nhiên danh sách hình dạng
    const shuffled = [...SHAPES].sort(() => Math.random() - 0.5);
    let selectedShape = null;
    let selectedSimBoard = null;

    // Ưu tiên chọn khối vừa đặt vừa có khả năng tạo dòng ăn điểm hoặc vừa khít
    for (const candidate of shuffled) {
      const validMoves = findAllValidPlacements(simBoard, candidate);
      if (validMoves.length > 0) {
        selectedShape = candidate;
        // Ưu tiên nước đi xóa được hàng/cột để bảng thông thoáng cho khối tiếp theo
        validMoves.sort((a, b) => b.clearedCount - a.clearedCount);
        const pickIndex = Math.random() < 0.65 ? 0 : Math.floor(Math.random() * validMoves.length);
        selectedSimBoard = validMoves[pickIndex].nextBoard;
        break;
      }
    }

    // Fallback an toàn: nếu bảng quá đầy, luôn dùng khối 1x1
    if (!selectedShape) {
      selectedShape = SHAPES[0]; // 1x1
      const moves = findAllValidPlacements(simBoard, selectedShape);
      if (moves.length > 0) {
        selectedSimBoard = moves[0].nextBoard;
      } else {
        selectedSimBoard = simBoard;
      }
    }

    chosenShapes.push(selectedShape);
    simBoard = selectedSimBoard;
  }

  // Trộn thứ tự hiển thị của 3 khối trong khay
  chosenShapes.sort(() => Math.random() - 0.5);

  trayPieces = chosenShapes.map((shape, idx) => {
    const bounds = getShapeBounds(shape.cells);
    return {
      shape,
      bounds,
      used: false,
      slotIndex: idx,
      hoverScale: 0
    };
  });
}

/**
 * Đảm bảo ngay cả khi người chơi đặt khối đầu tiên lệch với dự tính ban đầu,
 * các khối còn lại trong khay vẫn luôn đặt được lên bảng hiện tại.
 * Nếu một khối còn lại không còn chỗ nào đặt vừa, tự động chuyển hóa mềm mại
 * thành một khối vừa vặn với các ô trống hiện có để người chơi không bao giờ bị kẹt!
 */
function ensureRemainingPiecesPlayable() {
  let simBoard = cloneBoard(board);
  for (const piece of trayPieces) {
    if (piece.used) continue;
    const moves = findAllValidPlacements(simBoard, piece.shape);
    if (moves.length === 0) {
      // Tìm một khối khác có thể đặt vừa bảng hiện tại
      const shuffled = [...SHAPES].sort(() => Math.random() - 0.5);
      for (const candidate of shuffled) {
        const candidateMoves = findAllValidPlacements(simBoard, candidate);
        if (candidateMoves.length > 0) {
          piece.shape = candidate;
          piece.bounds = getShapeBounds(candidate.cells);
          simBoard = candidateMoves[0].nextBoard;
          spawnFloatingText(
            layout.traySlots[piece.slotIndex].centerX,
            layout.traySlots[piece.slotIndex].centerY,
            'Đổi khối hợp lý ✨',
            '#38bdf8'
          );
          break;
        }
      }
    } else {
      moves.sort((a, b) => b.clearedCount - a.clearedCount);
      simBoard = moves[0].nextBoard;
    }
  }
}

// --- TÍNH TOÁN VỊ TRÍ ĐẶT KHỐI TỪ TỌA ĐỘ KÉO ---
function getSnapGridPosition(piece, centerX, centerY) {
  const { cellSize, boardX, boardY } = layout;
  const piecePixelW = piece.bounds.cols * cellSize;
  const piecePixelH = piece.bounds.rows * cellSize;

  // Từ tâm của khối đang kéo suy ra góc trên-trái (top-left) của khối
  const topLeftX = centerX - piecePixelW / 2;
  const topLeftY = centerY - piecePixelH / 2;

  const col = Math.round((topLeftX - boardX) / cellSize);
  const row = Math.round((topLeftY - boardY) / cellSize);

  return { row, col };
}

// --- XỬ LÝ CỬ CHỈ GẮP - DI CHUYỂN - THẢ ---
function updateGestureInteraction() {
  if (!handState.detected) {
    // Nếu đang gắp mà mất tay đột ngột, giữ nguyên hoặc trả về khay nếu quá lâu
    return;
  }

  const px = handState.pinchPoint.x;
  const py = handState.pinchPoint.y;

  // 1. BẮT ĐẦU CHỤM NGÓN CÁI & NGÓN TRỎ -> Kiểm tra xem có chụm vào khối nào trong khay không
  if (handState.isPinching && !handState.wasPinching && grabbedPieceIndex === -1) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < trayPieces.length; i++) {
      const piece = trayPieces[i];
      if (piece.used) continue;

      const slot = layout.traySlots[i];
      // Khoảng cách từ điểm chụm 2 ngón tới tâm khối (mở rộng vùng nhạy để gắp nhanh hơn)
      const dist = Math.hypot(px - slot.centerX, py - slot.centerY);
      const grabRadius = Math.max(slot.width, slot.height) * 0.68;

      if (dist < grabRadius && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      grabbedPieceIndex = bestIdx;
      dragPos.x = px;
      dragPos.y = py;
    }
  }

  // 2. ĐANG GIỮ CHỤM 2 NGÓN & DI CHUYỂN -> Khối di chuyển theo
  if (handState.isPinching && grabbedPieceIndex !== -1) {
    dragPos.x = px;
    dragPos.y = py;
  }

  // 3. THẢ 2 NGÓN TAY RA -> Đặt khối vào bảng 8x8 nếu hợp lệ
  if (!handState.isPinching && handState.wasPinching && grabbedPieceIndex !== -1) {
    const piece = trayPieces[grabbedPieceIndex];
    const { row, col } = getSnapGridPosition(piece, dragPos.x, dragPos.y);

    if (canPlaceShape(board, piece.shape, row, col)) {
      placePieceOnBoard(piece, row, col);
      piece.used = true;
      grabbedPieceIndex = -1;

      // Nếu đã xếp hết 3 khối thì sinh 3 khối mới hợp lý
      if (trayPieces.every(p => p.used)) {
        generateSolvableTray();
      } else {
        ensureRemainingPiecesPlayable();
      }
    } else {
      // Thả ở ngoài hoặc vị trí không hợp lệ -> khối tự quay về khay
      grabbedPieceIndex = -1;
    }
  }

  handState.wasPinching = handState.isPinching;
}

function placePieceOnBoard(piece, startR, startC) {
  const placedCellsCount = piece.shape.cells.length;
  const sim = simulatePlaceAndClear(board, piece.shape, startR, startC);

  // Hiệu ứng sáng nhẹ ở các ô vừa đặt
  for (const [dr, dc] of piece.shape.cells) {
    const r = startR + dr;
    const c = startC + dc;
    cellFlashAnimations.push({ r, c, color: piece.shape.color, alpha: 0.9 });
  }

  board = sim.board;

  // Tính điểm
  let gainedScore = placedCellsCount * 10;
  if (sim.clearedCount > 0) {
    combo++;
    const lineBonus = sim.clearedCount * 100 * combo;
    gainedScore += lineBonus;

    // Tạo hạt pháo hoa dọc theo hàng/cột vừa ăn
    for (const r of sim.fullRows) {
      for (let c = 0; c < GRID_SIZE; c++) {
        spawnCellParticles(r, c, piece.shape.color);
      }
    }
    for (const c of sim.fullCols) {
      for (let r = 0; r < GRID_SIZE; r++) {
        spawnCellParticles(r, c, piece.shape.color);
      }
    }

    const centerBoardX = layout.boardX + layout.boardSize / 2;
    const centerBoardY = layout.boardY + layout.boardSize / 2;
    const msg = sim.clearedCount > 1
      ? `COMBO x${combo}! +${gainedScore} (${sim.clearedCount} HÀNG)`
      : `TUYỆT VỜI! +${gainedScore}`;
    spawnFloatingText(centerBoardX, centerBoardY, msg, '#fbbf24');
  } else {
    combo = 0;
    spawnFloatingText(dragPos.x, dragPos.y - 20, `+${gainedScore}`, '#e2e8f0');
  }

  score += gainedScore;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('ar_blockblast_best', bestScore);
  }

  scoreEl.textContent = score;
  bestScoreEl.textContent = bestScore;
  comboEl.textContent = `x${Math.max(1, combo)}`;
}

// --- HIỆU ỨNG HẠT & CHỮ NỔI ---
function spawnCellParticles(r, c, color) {
  const cx = layout.boardX + (c + 0.5) * layout.cellSize;
  const cy = layout.boardY + (r + 0.5) * layout.cellSize;
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 5,
      color,
      alpha: 1
    });
  }
}

function spawnFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, alpha: 1, vy: -1.8 });
}

// --- HỖ TRỢ CHUỘT (DỰ PHÒNG KHI TEST TRÊN MÁY TÍNH BÊN CẠNH CAMERA) ---
canvas.addEventListener('mousedown', (e) => {
  const mx = e.clientX;
  const my = e.clientY;
  for (let i = 0; i < trayPieces.length; i++) {
    if (trayPieces[i].used) continue;
    const slot = layout.traySlots[i];
    if (Math.hypot(mx - slot.centerX, my - slot.centerY) < Math.max(slot.width, slot.height) * 0.5) {
      grabbedPieceIndex = i;
      dragPos.x = mx;
      dragPos.y = my;
      break;
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (grabbedPieceIndex !== -1 && !handState.isPinching) {
    dragPos.x = e.clientX;
    dragPos.y = e.clientY;
  }
});

canvas.addEventListener('mouseup', () => {
  if (grabbedPieceIndex !== -1 && !handState.isPinching) {
    const piece = trayPieces[grabbedPieceIndex];
    const { row, col } = getSnapGridPosition(piece, dragPos.x, dragPos.y);
    if (canPlaceShape(board, piece.shape, row, col)) {
      placePieceOnBoard(piece, row, col);
      piece.used = true;
      grabbedPieceIndex = -1;
      if (trayPieces.every(p => p.used)) {
        generateSolvableTray();
      } else {
        ensureRemainingPiecesPlayable();
      }
    } else {
      grabbedPieceIndex = -1;
    }
  }
});

// --- VẼ GIAO DIỆN LÊN CANVAS ---
function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBlockCell(x, y, size, color, alpha = 1, showGrabDot = false, isGrabbed = false) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const pad = 2.5;
  const bx = x + pad;
  const by = y + pad;
  const bs = size - pad * 2;

  // Thân khối
  ctx.fillStyle = color;
  drawRoundedRect(bx, by, bs, bs, 7);
  ctx.fill();

  // Viền sáng 3D phía trên
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Độ bóng bên trong
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  drawRoundedRect(bx + 4, by + 4, bs - 8, (bs - 8) * 0.42, 4);
  ctx.fill();

  // Vẽ chấm tròn trên từng ô của khối chuẩn bị để người chơi dễ nhìn điểm gắp
  if (showGrabDot) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, isGrabbed ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = isGrabbed ? '#fef08a' : 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.stroke();
  }

  ctx.restore();
}

function renderGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. VẼ HÌNH ẢNH CAMERA NỀN (Lật gương ngang để thao tác tay tự nhiên)
  if (toggleCameraBgEl.checked && videoElement.readyState >= 2) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    // Căn chỉnh tỉ lệ cover màn hình
    const vw = videoElement.videoWidth || 1280;
    const vh = videoElement.videoHeight || 720;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const drawW = vw * scale;
    const drawH = vh * scale;
    const offsetX = (canvas.width - drawW) / 2;
    const offsetY = (canvas.height - drawH) / 2;

    ctx.drawImage(videoElement, offsetX, offsetY, drawW, drawH);
    ctx.restore();

    // Phủ lớp tối mờ giúp bảng game và khối nổi bật rõ ràng trên nền camera
    ctx.fillStyle = 'rgba(11, 15, 25, 0.52)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    // Nền gradient tối nếu tắt hiển thị camera
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 50,
      canvas.width / 2, canvas.height / 2, canvas.width
    );
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0b0f19');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. VẼ BẢNG 8x8
  const { boardX, boardY, boardSize, cellSize } = layout;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 2;
  drawRoundedRect(boardX - 8, boardY - 8, boardSize + 16, boardSize + 16, 16);
  ctx.fill();
  ctx.stroke();

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cx = boardX + c * cellSize;
      const cy = boardY + r * cellSize;

      // Ô lưới nền
      ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      drawRoundedRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4, 6);
      ctx.fill();
      ctx.stroke();

      // Nếu ô đã có khối
      if (board[r][c]) {
        drawBlockCell(cx, cy, cellSize, board[r][c], 0.95, false, false);
      }
    }
  }
  ctx.restore();

  // Hiệu ứng sáng ô vừa đặt
  for (let i = cellFlashAnimations.length - 1; i >= 0; i--) {
    const f = cellFlashAnimations[i];
    const cx = boardX + f.c * cellSize;
    const cy = boardY + f.r * cellSize;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = f.alpha * 0.4;
    drawRoundedRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4, 6);
    ctx.fill();
    ctx.restore();
    f.alpha -= 0.06;
    if (f.alpha <= 0) cellFlashAnimations.splice(i, 1);
  }

  // 3. VẼ KHAY 3 KHỐI CHUẨN BỊ & CÁC CHẤM TRÒN ĐỂ GẮP
  for (let i = 0; i < trayPieces.length; i++) {
    const piece = trayPieces[i];
    const slot = layout.traySlots[i];

    // Khung chứa từng khối chuẩn bị
    const isHovered =
      handState.detected &&
      !piece.used &&
      grabbedPieceIndex === -1 &&
      Math.hypot(handState.pinchPoint.x - slot.centerX, handState.pinchPoint.y - slot.centerY) <
        Math.max(slot.width, slot.height) * 0.55;

    ctx.save();
    ctx.fillStyle = isHovered ? 'rgba(30, 58, 138, 0.65)' : 'rgba(15, 23, 42, 0.72)';
    ctx.strokeStyle = isHovered ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    drawRoundedRect(slot.x, slot.y, slot.width, slot.height, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (piece.used || grabbedPieceIndex === i) continue;

    // Tính kích thước khối thu nhỏ vừa khay
    const maxDim = Math.max(piece.bounds.rows, piece.bounds.cols);
    const previewCellSize = Math.min(
      cellSize * 0.68,
      (Math.min(slot.width, slot.height) * 0.76) / maxDim
    );

    const totalW = piece.bounds.cols * previewCellSize;
    const totalH = piece.bounds.rows * previewCellSize;
    const startX = slot.centerX - totalW / 2;
    const startY = slot.centerY - totalH / 2;

    // Vẽ từng ô của khối chuẩn bị kèm chấm tròn
    for (const [dr, dc] of piece.shape.cells) {
      drawBlockCell(
        startX + dc * previewCellSize,
        startY + dr * previewCellSize,
        previewCellSize,
        piece.shape.color,
        0.95,
        true,
        false
      );
    }

    // Vẽ CHẤM TÂM GẮP NỔI BẬT (Anchor Dot) ở giữa khối để người chơi dễ chụm 2 ngón tay vào
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.16;
    ctx.save();
    ctx.beginPath();
    ctx.arc(slot.centerX, slot.centerY, 11 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.22)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(slot.centerX, slot.centerY, 6, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? '#38bdf8' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.restore();
  }

  // 4. VẼ KHỐI ĐANG ĐƯỢC GẮP DI CHUYỂN & BÓNG DỰ ĐOÁN TRÊN BẢNG 8x8
  if (grabbedPieceIndex !== -1) {
    const piece = trayPieces[grabbedPieceIndex];
    const { row, col } = getSnapGridPosition(piece, dragPos.x, dragPos.y);
    const isValid = canPlaceShape(board, piece.shape, row, col);

    // Nếu vị trí hợp lệ trên bảng 8x8 -> Vẽ bóng Ghost (Preview) trên bảng
    if (isValid) {
      for (const [dr, dc] of piece.shape.cells) {
        const gx = boardX + (col + dc) * cellSize;
        const gy = boardY + (row + dr) * cellSize;
        drawBlockCell(gx, gy, cellSize, piece.shape.color, 0.38, false, false);
      }

      // Kiểm tra nếu nước đi này sẽ xóa được hàng/cột nào thì tô sáng hàng/cột đó!
      const sim = simulatePlaceAndClear(board, piece.shape, row, col);
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      for (const r of sim.fullRows) {
        drawRoundedRect(boardX, boardY + r * cellSize, boardSize, cellSize, 6);
        ctx.stroke();
      }
      for (const c of sim.fullCols) {
        drawRoundedRect(boardX + c * cellSize, boardY, cellSize, boardSize, 6);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Vẽ khối đang bay theo 2 ngón tay với kích thước thật của bảng
    const pieceW = piece.bounds.cols * cellSize;
    const pieceH = piece.bounds.rows * cellSize;
    const topLeftX = dragPos.x - pieceW / 2;
    const topLeftY = dragPos.y - pieceH / 2;

    for (const [dr, dc] of piece.shape.cells) {
      drawBlockCell(
        topLeftX + dc * cellSize,
        topLeftY + dr * cellSize,
        cellSize,
        piece.shape.color,
        0.92,
        true,
        true
      );
    }
  }

  // 5. VẼ CỬ CHỈ BÀN TAY (NGÓN CÁI, NGÓN TRỎ & ĐIỂM GẮP)
  if (handState.detected) {
    drawHandOverlay();
  }

  // 6. VẼ HẠT NỔ & CHỮ ĐIỂM NỔI
  updateAndDrawParticles();
  updateAndDrawFloatingTexts();

  requestAnimationFrame(renderGame);
}

function drawHandOverlay() {
  const { thumbTip, indexTip, pinchPoint, isPinching, landmarks } = handState;

  ctx.save();

  // Vẽ các khớp xương bàn tay mờ nhẹ để người chơi thấy tay mình trong không gian
  if (landmarks) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 2;
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Ngón cái
      [0, 5], [5, 6], [6, 7], [7, 8],       // Ngón trỏ
      [5, 9], [9, 13], [13, 17], [0, 17]    // Lòng bàn tay
    ];
    for (const [a, b] of connections) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      ctx.beginPath();
      ctx.moveTo((1 - pa.x) * canvas.width, pa.y * canvas.height);
      ctx.lineTo((1 - pb.x) * canvas.width, pb.y * canvas.height);
      ctx.stroke();
    }
  }

  // Đường nối giữa đầu ngón cái và đầu ngón trỏ
  ctx.beginPath();
  ctx.moveTo(thumbTip.x, thumbTip.y);
  ctx.lineTo(indexTip.x, indexTip.y);
  ctx.strokeStyle = isPinching ? '#10b981' : '#38bdf8';
  ctx.lineWidth = isPinching ? 4 : 2.5;
  ctx.stroke();

  // Chấm đầu ngón cái
  ctx.beginPath();
  ctx.arc(thumbTip.x, thumbTip.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = isPinching ? '#10b981' : '#f43f5e';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Chấm đầu ngón trỏ
  ctx.beginPath();
  ctx.arc(indexTip.x, indexTip.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = isPinching ? '#10b981' : '#38bdf8';
  ctx.fill();
  ctx.stroke();

  // Tâm gắp (giữa 2 ngón)
  ctx.beginPath();
  ctx.arc(pinchPoint.x, pinchPoint.y, isPinching ? 12 : 7, 0, Math.PI * 2);
  ctx.fillStyle = isPinching ? 'rgba(16, 185, 129, 0.85)' : 'rgba(255, 255, 255, 0.75)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isPinching ? '#ecfdf5' : '#0f172a';
  ctx.stroke();

  ctx.restore();
}

function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // trọng lực nhẹ
    p.alpha -= 0.025;

    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function updateAndDrawFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.alpha -= 0.02;

    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = ft.alpha;
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ft.color;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

// --- KHỞI TẠO MEDIAPIPE HANDS & CAMERA ---
function onHandResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    handState.landmarks = lm;

    // Landmark 4: Đầu ngón cái (THUMB_TIP), Landmark 8: Đầu ngón trỏ (INDEX_FINGER_TIP)
    // Lật ngang (1 - x) vì camera hiển thị dạng gương
    const rawThumbX = (1 - lm[4].x) * canvas.width;
    const rawThumbY = lm[4].y * canvas.height;
    const rawIndexX = (1 - lm[8].x) * canvas.width;
    const rawIndexY = lm[8].y * canvas.height;

    if (!handState.detected) {
      handState.thumbTip = { x: rawThumbX, y: rawThumbY };
      handState.indexTip = { x: rawIndexX, y: rawIndexY };
      handState.pinchPoint = {
        x: (rawThumbX + rawIndexX) / 2,
        y: (rawThumbY + rawIndexY) / 2
      };
      handState.detected = true;
    } else {
      // Adaptive smoothing: khi di chuyển tay nhanh thì bám theo gần như tức thì (0.9)
      const moveSpeed = Math.hypot(rawIndexX - handState.indexTip.x, rawIndexY - handState.indexTip.y);
      const dynamicAlpha = moveSpeed > 35 ? 0.92 : SMOOTH_FACTOR;

      handState.thumbTip.x += (rawThumbX - handState.thumbTip.x) * dynamicAlpha;
      handState.thumbTip.y += (rawThumbY - handState.thumbTip.y) * dynamicAlpha;
      handState.indexTip.x += (rawIndexX - handState.indexTip.x) * dynamicAlpha;
      handState.indexTip.y += (rawIndexY - handState.indexTip.y) * dynamicAlpha;

      // Tính trực tiếp tâm gắp từ 2 đầu ngón tay để bỏ độ trễ kép
      handState.pinchPoint.x = (handState.thumbTip.x + handState.indexTip.x) / 2;
      handState.pinchPoint.y = (handState.thumbTip.y + handState.indexTip.y) / 2;
    }

    // Tính khoảng cách chụm chuẩn hóa theo kích thước bàn tay (khoảng cách cổ tay 0 -> khớp giữa 9)
    const handSize = Math.hypot(
      (lm[0].x - lm[9].x) * canvas.width,
      (lm[0].y - lm[9].y) * canvas.height
    );
    const pinchDist = Math.hypot(
      handState.thumbTip.x - handState.indexTip.x,
      handState.thumbTip.y - handState.indexTip.y
    );

    // Ngưỡng nhạy hơn: chỉ cần chụm nhẹ là bắt khối ngay và hé nhẹ là thả khối
    const pinchStartThreshold = Math.max(46, handSize * 0.43);
    const pinchReleaseThreshold = Math.max(56, handSize * 0.50);

    if (!handState.isPinching && pinchDist < pinchStartThreshold) {
      handState.isPinching = true;
    } else if (handState.isPinching && pinchDist > pinchReleaseThreshold) {
      handState.isPinching = false;
    }

    camDotEl.className = 'dot active';
    statusTextEl.textContent = handState.isPinching
      ? '👌 Đang chụm 2 ngón (Giữ & di chuyển khối)'
      : '🖐️ Đã nhận diện tay (Chụm ngón cái & ngón trỏ vào chấm tâm khối để gắp)';

    updateGestureInteraction();
  } else {
    handState.detected = false;
    camDotEl.className = 'dot loading';
    statusTextEl.textContent = 'Đưa bàn tay lên trước Camera để điều khiển...';
  }
}

async function initCameraAndHandTracking() {
  try {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });

    hands.onResults(onHandResults);

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480
    });

    await camera.start();
    camDotEl.className = 'dot active';
    statusTextEl.textContent = 'Camera đã sẵn sàng! Hãy đưa tay lên trước màn hình.';
  } catch (err) {
    console.error('Lỗi khởi tạo Camera:', err);
    camDotEl.className = 'dot error';
    statusTextEl.textContent =
      'Không thể mở Camera (hãy cấp quyền trên trình duyệt hoặc dùng chuột kéo thả).';
  }
}

function resetGame() {
  board = createEmptyBoard();
  score = 0;
  combo = 0;
  grabbedPieceIndex = -1;
  scoreEl.textContent = '0';
  comboEl.textContent = 'x1';
  generateSolvableTray();
}

resetBtn.addEventListener('click', resetGame);

// --- KHỞI CHẠY ỨNG DỤNG ---
resizeCanvas();
resetGame();
requestAnimationFrame(renderGame);
initCameraAndHandTracking();
