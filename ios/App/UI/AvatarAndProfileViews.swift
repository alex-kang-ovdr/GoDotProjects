import PlayHubCore
import SwiftUI
import UIKit

public struct AvatarCosmeticItem: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let category: String      // hat, face, top, back
    public let categoryLabel: String // 모자, 얼굴, 상의, 등 장식
    public let owned: Bool
    public let price: Int
    public let accentHex: String
    public let sfSymbol: String
}

public enum AvatarCatalog {
    public static let categories: [(id: String, label: String)] = [
        ("all", "전체"),
        ("hat", "모자"),
        ("face", "얼굴"),
        ("top", "상의"),
        ("back", "등 장식")
    ]

    public static let items: [AvatarCosmeticItem] = [
        AvatarCosmeticItem(id: "i1", name: "에메랄드 테크 후디", category: "top", categoryLabel: "상의", owned: true, price: 0, accentHex: "#4ADE80", sfSymbol: "tshirt.fill"),
        AvatarCosmeticItem(id: "i2", name: "사이버 시안 바이저", category: "face", categoryLabel: "얼굴", owned: true, price: 0, accentHex: "#72DCFF", sfSymbol: "eyeglasses"),
        AvatarCosmeticItem(id: "i3", name: "네온 스트릿 캡", category: "hat", categoryLabel: "모자", owned: true, price: 0, accentHex: "#00E290", sfSymbol: "graduationcap.fill"),
        AvatarCosmeticItem(id: "i4", name: "홀로그램 사이버 윙", category: "back", categoryLabel: "등 장식", owned: false, price: 450, accentHex: "#64FCC9", sfSymbol: "sparkles"),
        AvatarCosmeticItem(id: "i5", name: "미드나잇 스트릿 재킷", category: "top", categoryLabel: "상의", owned: true, price: 0, accentHex: "#60A5FA", sfSymbol: "tshirt"),
        AvatarCosmeticItem(id: "i6", name: "골드 챔피언 크라운", category: "hat", categoryLabel: "모자", owned: false, price: 300, accentHex: "#FFD147", sfSymbol: "crown.fill")
    ]

    public static let accentSwatches: [(hex: String, name: String)] = [
        ("#00B06F", "플레이 그린"),
        ("#142C25", "에버그린"),
        ("#2563EB", "네온 블루"),
        ("#7C3AED", "퍼플 펄스"),
        ("#D97706", "골드 스파크")
    ]

    public static let defaultEquipped: Set<String> = ["i1", "i2"]
}

private enum StitchPalette {
    static let playGreen = Color(red: 0.0, green: 0.690, blue: 0.435)        // #00B06F
    static let onPlayGreen = Color(red: 0.0, green: 0.129, blue: 0.067)      // #002111
    static let onlineDot = Color(red: 0.0, green: 0.886, blue: 0.565)        // #00E290
    static let coinGold = Color(red: 1.0, green: 0.820, blue: 0.278)         // #FFD147
    static let surface = Color(red: 0.098, green: 0.106, blue: 0.114)        // #191B1D
    static let container = Color(red: 0.137, green: 0.149, blue: 0.161)      // #232629
    static let containerHigh = Color(red: 0.169, green: 0.180, blue: 0.196)  // #2B2E32
    static let containerHighest = Color(red: 0.204, green: 0.220, blue: 0.235) // #34383C
    static let outlineVariant = Color(red: 0.204, green: 0.220, blue: 0.235) // #34383C
    static let onSurfaceVariant = Color(red: 0.667, green: 0.671, blue: 0.678) // #AAABAD
    static let errorRed = Color(red: 1.0, green: 0.443, blue: 0.424)         // #FF716C
}

/// Interactive 3D-style Voxel Avatar Preview Canvas (zero external image bloat).
/// Supports horizontal drag-to-rotate (`360° 3D 미리보기`) and live equipped item rendering.
public struct VoxelAvatarCanvas: View {
    public let equippedIds: Set<String>
    public let accentHex: String
    public let portraitMode: Bool
    @State private var yawOffset: CGFloat = 0

    public init(equippedIds: Set<String>, accentHex: String, portraitMode: Bool = false) {
        self.equippedIds = equippedIds
        self.accentHex = accentHex
        self.portraitMode = portraitMode
    }

    public var body: some View {
        Canvas { ctx, size in
            let w = size.width
            let h = size.height
            guard w > 0, h > 0 else { return }

            let accent = colorFromHex(accentHex)
            let bgGrad = Gradient(colors: [
                Color(red: 0.169, green: 0.192, blue: 0.212),
                Color(red: 0.094, green: 0.106, blue: 0.118),
                Color(red: 0.067, green: 0.075, blue: 0.082)
            ])
            ctx.fill(
                Path(CGRect(origin: .zero, size: size)),
                with: .radialGradient(
                    bgGrad,
                    center: CGPoint(x: w * 0.5, y: h * (portraitMode ? 0.45 : 0.42)),
                    startRadius: 4,
                    endRadius: max(w, h) * 0.72
                )
            )

            if !portraitMode {
                let floorRect = CGRect(x: w * 0.16, y: h * 0.78, width: w * 0.68, height: h * 0.17)
                ctx.fill(
                    Path(ellipseIn: floorRect),
                    with: .radialGradient(
                        Gradient(colors: [accent.opacity(0.28), .clear]),
                        center: CGPoint(x: w * 0.5, y: h * 0.87),
                        startRadius: 2,
                        endRadius: w * 0.34
                    )
                )
            }

            let scale = portraitMode ? min(w, h) / 108.0 : min(w * 0.72, h * 0.92) / 180.0
            let cx = w * 0.5
            let baseY = portraitMode ? h * 1.18 : h * 0.88
            let shift = yawOffset * 8.0 * scale

            let hasHoodie = equippedIds.contains("i1")
            let hasMidnight = equippedIds.contains("i5") && !hasHoodie
            let hasVisor = equippedIds.contains("i2")
            let hasCap = equippedIds.contains("i3")
            let hasCrown = equippedIds.contains("i6") && !hasCap
            let hasWings = equippedIds.contains("i4")

            let topMain: Color = hasHoodie
                ? Color(red: 0.396, green: 0.910, blue: 0.267)
                : (hasMidnight ? Color(red: 0.145, green: 0.388, blue: 0.922) : accent)
            let topShade: Color = hasHoodie
                ? Color(red: 0.180, green: 0.659, blue: 0.149)
                : (hasMidnight ? Color(red: 0.114, green: 0.306, blue: 0.847) : Color(red: 0.078, green: 0.173, blue: 0.145))

            func drawVoxel(_ x: CGFloat, _ y: CGFloat, _ bw: CGFloat, _ bh: CGFloat, front: Color, side: Color) {
                let depth = (3.5 + yawOffset * 2.5) * scale
                if depth >= 0 {
                    ctx.fill(Path(CGRect(x: x + bw - 1, y: y + 2 * scale, width: depth, height: bh - 2 * scale)), with: .color(side))
                } else {
                    ctx.fill(Path(CGRect(x: x + depth, y: y + 2 * scale, width: -depth + 1, height: bh - 2 * scale)), with: .color(side))
                }
                let r = Path(roundedRect: CGRect(x: x, y: y, width: bw, height: bh), cornerRadius: 2.5 * scale)
                ctx.fill(r, with: .color(front))
                ctx.stroke(r, with: .color(.black.opacity(0.35)), lineWidth: 1.2 * scale)
            }

            // 1. Cyber Wings (back slot)
            if hasWings {
                let wy = baseY - 88 * scale
                let spread = 1.0 - abs(yawOffset) * 0.22
                var lw = Path()
                lw.move(to: CGPoint(x: cx - 18 * scale + shift * 0.4, y: wy))
                lw.addLine(to: CGPoint(x: cx - (68 * spread) * scale + shift * 0.2, y: wy - 28 * scale))
                lw.addLine(to: CGPoint(x: cx - (54 * spread) * scale + shift * 0.2, y: wy + 16 * scale))
                lw.addLine(to: CGPoint(x: cx - 18 * scale + shift * 0.4, y: wy + 20 * scale))
                lw.closeSubpath()

                var rw = Path()
                rw.move(to: CGPoint(x: cx + 18 * scale + shift * 0.4, y: wy))
                rw.addLine(to: CGPoint(x: cx + (68 * spread) * scale + shift * 0.2, y: wy - 28 * scale))
                rw.addLine(to: CGPoint(x: cx + (54 * spread) * scale + shift * 0.2, y: wy + 16 * scale))
                rw.addLine(to: CGPoint(x: cx + 18 * scale + shift * 0.4, y: wy + 20 * scale))
                rw.closeSubpath()

                let wingFill = Color(red: 0.392, green: 0.988, blue: 0.788).opacity(0.45)
                let wingStroke = Color(red: 0.447, green: 0.863, blue: 1.0)
                ctx.fill(lw, with: .color(wingFill)); ctx.stroke(lw, with: .color(wingStroke), lineWidth: 2 * scale)
                ctx.fill(rw, with: .color(wingFill)); ctx.stroke(rw, with: .color(wingStroke), lineWidth: 2 * scale)
            }

            // 2. Legs & Sneakers
            if !portraitMode {
                let legTop = baseY - 56 * scale
                drawVoxel(cx - 19 * scale + shift * 0.3, legTop, 16 * scale, 48 * scale, front: Color(white: 0.09), side: Color(white: 0.04))
                drawVoxel(cx + 3 * scale + shift * 0.3, legTop, 16 * scale, 48 * scale, front: Color(white: 0.11), side: Color(white: 0.05))
                drawVoxel(cx - 21 * scale + shift * 0.3, baseY - 11 * scale, 19 * scale, 10 * scale, front: Color(white: 0.12), side: topMain)
                drawVoxel(cx + 2 * scale + shift * 0.3, baseY - 11 * scale, 19 * scale, 10 * scale, front: Color(white: 0.12), side: topMain)
            }

            // 3. Torso & Crossed Arms
            let torsoW = 46 * scale
            let torsoH = 54 * scale
            let torsoLeft = cx - torsoW / 2 + shift * 0.5
            let torsoTop = baseY - 109 * scale
            drawVoxel(torsoLeft, torsoTop, torsoW, torsoH, front: topMain, side: topShade)
            // Center zipper
            ctx.fill(Path(CGRect(x: cx - 1.5 * scale + shift * 0.7, y: torsoTop, width: 3 * scale, height: torsoH)), with: .color(Color(white: 0.07)))
            // PlayHub Evergreen + Lime chest emblem
            let badgeRect = CGRect(x: cx + 6 * scale + shift * 0.7, y: torsoTop + 12 * scale, width: 11 * scale, height: 11 * scale)
            ctx.fill(Path(roundedRect: badgeRect, cornerRadius: 2 * scale), with: .color(Color(red: 0.078, green: 0.173, blue: 0.145)))
            var tri = Path()
            tri.move(to: CGPoint(x: badgeRect.minX + 3.5 * scale, y: badgeRect.minY + 2.5 * scale))
            tri.addLine(to: CGPoint(x: badgeRect.maxX - 2.0 * scale, y: badgeRect.midY))
            tri.addLine(to: CGPoint(x: badgeRect.minX + 3.5 * scale, y: badgeRect.maxY - 2.5 * scale))
            tri.closeSubpath()
            ctx.fill(tri, with: .color(Color(red: 0.871, green: 0.925, blue: 0.651)))

            drawVoxel(torsoLeft - 11 * scale, torsoTop + 4 * scale, 13 * scale, 36 * scale, front: topMain, side: topShade)
            drawVoxel(torsoLeft + torsoW - 2 * scale, torsoTop + 4 * scale, 13 * scale, 36 * scale, front: topMain, side: topShade)
            drawVoxel(torsoLeft - 4 * scale, torsoTop + 23 * scale, torsoW + 8 * scale, 12 * scale, front: topShade, side: Color(white: 0.1))

            // 4. Head, Hair, Visor/Eyes, Smile
            let headSize = 36 * scale
            let headLeft = cx - headSize / 2 + shift
            let headTop = torsoTop - headSize - 2 * scale
            ctx.fill(Path(CGRect(x: cx - 7 * scale + shift * 0.8, y: torsoTop - 5 * scale, width: 14 * scale, height: 7 * scale)), with: .color(Color(red: 0.78, green: 0.57, blue: 0.42)))
            drawVoxel(headLeft, headTop, headSize, headSize, front: Color(red: 0.89, green: 0.68, blue: 0.53), side: Color(red: 0.78, green: 0.57, blue: 0.42))
            ctx.fill(Path(CGRect(x: headLeft - 1 * scale, y: headTop - 3 * scale, width: headSize + 2 * scale, height: 13 * scale)), with: .color(Color(white: 0.11)))
            ctx.fill(Path(CGRect(x: headLeft - 2 * scale, y: headTop + 4 * scale, width: 7 * scale, height: 14 * scale)), with: .color(Color(white: 0.11)))
            ctx.fill(Path(CGRect(x: headLeft + headSize - 5 * scale, y: headTop + 4 * scale, width: 7 * scale, height: 14 * scale)), with: .color(Color(white: 0.11)))

            let faceShift = shift * 0.45
            if hasVisor {
                let outer = CGRect(x: headLeft - 2 * scale + faceShift, y: headTop + 12 * scale, width: headSize + 4 * scale, height: 11 * scale)
                ctx.fill(Path(roundedRect: outer, cornerRadius: 3 * scale), with: .color(Color(red: 0.05, green: 0.23, blue: 0.30)))
                let inner = CGRect(x: headLeft + 1 * scale + faceShift, y: headTop + 14 * scale, width: headSize - 2 * scale, height: 7 * scale)
                ctx.fill(
                    Path(roundedRect: inner, cornerRadius: 2 * scale),
                    with: .linearGradient(
                        Gradient(colors: [Color.cyan, Color(red: 0.65, green: 0.95, blue: 1.0), StitchPalette.onlineDot]),
                        startPoint: CGPoint(x: inner.minX, y: inner.midY),
                        endPoint: CGPoint(x: inner.maxX, y: inner.midY)
                    )
                )
            } else {
                ctx.fill(Path(CGRect(x: headLeft + 9 * scale + faceShift, y: headTop + 15 * scale, width: 4 * scale, height: 5 * scale)), with: .color(Color(white: 0.08)))
                ctx.fill(Path(CGRect(x: headLeft + 23 * scale + faceShift, y: headTop + 15 * scale, width: 4 * scale, height: 5 * scale)), with: .color(Color(white: 0.08)))
            }
            var smile = Path()
            smile.move(to: CGPoint(x: headLeft + 13 * scale + faceShift, y: headTop + 28 * scale))
            smile.addLine(to: CGPoint(x: headLeft + 23 * scale + faceShift, y: headTop + 27.2 * scale))
            ctx.stroke(smile, with: .color(Color(red: 0.42, green: 0.26, blue: 0.15)), lineWidth: 2 * scale)

            // 5. Hat Slot: Cap or Crown
            if hasCap {
                drawVoxel(headLeft - 2 * scale, headTop - 11 * scale, headSize + 4 * scale, 13 * scale, front: Color(white: 0.13), side: StitchPalette.playGreen)
                ctx.fill(
                    Path(roundedRect: CGRect(x: headLeft - 4 * scale + faceShift * 0.5, y: headTop - 1 * scale, width: headSize + 14 * scale, height: 5 * scale), cornerRadius: 2 * scale),
                    with: .color(StitchPalette.onlineDot)
                )
            } else if hasCrown {
                var crown = Path()
                let cl = headLeft + 3 * scale
                let cr = headLeft + headSize - 3 * scale
                let cb = headTop - 1 * scale
                let ct = headTop - 15 * scale
                crown.move(to: CGPoint(x: cl, y: cb))
                crown.addLine(to: CGPoint(x: cl, y: ct + 3 * scale))
                crown.addLine(to: CGPoint(x: cl + (cr - cl) * 0.25, y: cb - 6 * scale))
                crown.addLine(to: CGPoint(x: (cl + cr) / 2, y: ct))
                crown.addLine(to: CGPoint(x: cl + (cr - cl) * 0.75, y: cb - 6 * scale))
                crown.addLine(to: CGPoint(x: cr, y: ct + 3 * scale))
                crown.addLine(to: CGPoint(x: cr, y: cb))
                crown.closeSubpath()
                ctx.fill(crown, with: .color(StitchPalette.coinGold))
                ctx.stroke(crown, with: .color(Color.orange), lineWidth: 1.5 * scale)
            }
        }
        .gesture(
            portraitMode ? nil : DragGesture(minimumDistance: 2)
                .onChanged { value in
                    yawOffset = min(max(value.translation.width / 120.0, -1.0), 1.0)
                }
        )
    }
}

/// Stitch-aligned Avatar Studio Tab (`아바타 스튜디오` + 3D Voxel Stage + Category Chips + 2-Col Wardrobe/Shop Grid).
public struct AvatarStudioView: View {
    @ObservedObject public var vm: PlayHubShellViewModel
    @State private var selectedCategory: String = "all"
    @State private var savedToast: Bool = false
    @State private var shopPreviewItem: AvatarCosmeticItem?

    public init(vm: PlayHubShellViewModel) {
        self.vm = vm
    }

    private var visibleItems: [AvatarCosmeticItem] {
        AvatarCatalog.items.filter { selectedCategory == "all" || $0.category == selectedCategory }
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Header + Primary Save Button
                HStack {
                    Text("아바타 스튜디오")
                        .font(.title3.bold())
                        .foregroundStyle(.white)
                    Spacer()
                    Button {
                        savedToast = true
                        Task {
                            await vm.saveAvatarStyle()
                            try? await Task.sleep(nanoseconds: 1_800_000_000)
                            savedToast = false
                        }
                    } label: {
                        Label(savedToast ? "저장됨" : "저장", systemImage: savedToast ? "checkmark" : "square.and.arrow.down")
                            .font(.subheadline.bold())
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(StitchPalette.playGreen, in: RoundedRectangle(cornerRadius: 8))
                            .foregroundStyle(StitchPalette.onPlayGreen)
                    }
                }
                .padding(.horizontal, 16)

                // 4:3 Interactive 3D Preview Stage
                ZStack {
                    VoxelAvatarCanvas(
                        equippedIds: vm.equippedAvatarIds,
                        accentHex: vm.avatarAccentHex,
                        portraitMode: false
                    )
                    .frame(height: 256)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(StitchPalette.outlineVariant, lineWidth: 1))

                    VStack {
                        HStack {
                            HStack(spacing: 5) {
                                Image(systemName: "rotate.3d")
                                    .font(.caption.bold())
                                    .foregroundStyle(StitchPalette.playGreen)
                                Text("3D 미리보기")
                                    .font(.caption2.bold())
                                    .foregroundStyle(.white)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color.black.opacity(0.75), in: Capsule())
                            .overlay(Capsule().stroke(StitchPalette.outlineVariant, lineWidth: 1))
                            Spacer()
                        }
                        Spacer()
                        HStack {
                            Spacer()
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(StitchPalette.onlineDot)
                                    .frame(width: 7, height: 7)
                                Text("\(vm.equippedAvatarIds.count)개 착용 중")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.white)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color.black.opacity(0.75), in: Capsule())
                            .overlay(Capsule().stroke(StitchPalette.outlineVariant, lineWidth: 1))
                        }
                    }
                    .padding(12)
                }
                .padding(.horizontal, 16)

                // Accent Theme Swatch Bar
                HStack {
                    Text("테마 컬러")
                        .font(.caption.bold())
                        .foregroundStyle(StitchPalette.onSurfaceVariant)
                    Spacer()
                    HStack(spacing: 8) {
                        ForEach(AvatarCatalog.accentSwatches, id: \.hex) { swatch in
                            let selected = swatch.hex.caseInsensitiveCompare(vm.avatarAccentHex) == .orderedSame
                            Button {
                                vm.setAvatarAccentColor(swatch.hex)
                            } label: {
                                Circle()
                                    .fill(colorFromHex(swatch.hex))
                                    .frame(width: 26, height: 26)
                                    .overlay(Circle().stroke(selected ? Color.white : StitchPalette.outlineVariant, lineWidth: selected ? 2.5 : 1))
                            }
                            .accessibilityLabel(swatch.name)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(StitchPalette.container, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(StitchPalette.outlineVariant, lineWidth: 1))
                .padding(.horizontal, 16)

                // Category Filter Chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(AvatarCatalog.categories, id: \.id) { cat in
                            let active = selectedCategory == cat.id
                            Button {
                                selectedCategory = cat.id
                            } label: {
                                Text(cat.label)
                                    .font(.subheadline.bold())
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                    .background(active ? StitchPalette.playGreen : StitchPalette.container, in: Capsule())
                                    .overlay(Capsule().stroke(active ? Color.clear : StitchPalette.outlineVariant, lineWidth: 1))
                                    .foregroundStyle(active ? StitchPalette.onPlayGreen : StitchPalette.onSurfaceVariant)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }

                // Wardrobe & Shop Section
                HStack {
                    Text("내 옷장 & 상점")
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                    Spacer()
                    Text("\(visibleItems.count)개 아이템")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(StitchPalette.onSurfaceVariant)
                }
                .padding(.horizontal, 16)

                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(visibleItems) { item in
                        let equipped = vm.equippedAvatarIds.contains(item.id)
                        Button {
                            if item.owned || equipped {
                                vm.toggleEquipAvatarItem(item)
                            } else {
                                shopPreviewItem = item
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                ZStack(alignment: .topTrailing) {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(
                                            RadialGradient(
                                                colors: [colorFromHex(item.accentHex).opacity(0.32), StitchPalette.containerHighest],
                                                center: .center,
                                                startRadius: 4,
                                                endRadius: 80
                                            )
                                        )
                                        .aspectRatio(1.0, contentMode: .fit)
                                        .overlay(
                                            Image(systemName: item.sfSymbol)
                                                .font(.system(size: 38, weight: .semibold))
                                                .foregroundStyle(colorFromHex(item.accentHex))
                                        )
                                    if equipped {
                                        Circle()
                                            .fill(StitchPalette.playGreen)
                                            .frame(width: 24, height: 24)
                                            .overlay(
                                                Image(systemName: "checkmark")
                                                    .font(.caption2.bold())
                                                    .foregroundStyle(StitchPalette.onPlayGreen)
                                            )
                                            .padding(8)
                                    }
                                }
                                Text(item.name)
                                    .font(.subheadline.bold())
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                                HStack {
                                    Text(item.categoryLabel)
                                        .font(.caption2)
                                        .foregroundStyle(StitchPalette.onSurfaceVariant)
                                    Spacer()
                                    if item.owned || equipped {
                                        Text(equipped ? "착용 중" : "보유 중")
                                            .font(.caption2.bold())
                                            .foregroundStyle(equipped ? StitchPalette.playGreen : StitchPalette.onSurfaceVariant)
                                    } else {
                                        HStack(spacing: 3) {
                                            Image(systemName: "bitcoinsign.circle.fill")
                                                .font(.caption2)
                                            Text("\(item.price)")
                                                .font(.caption.monospacedDigit())
                                        }
                                        .foregroundStyle(StitchPalette.coinGold)
                                    }
                                }
                            }
                            .padding(8)
                            .background(StitchPalette.container, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(equipped ? StitchPalette.playGreen : StitchPalette.outlineVariant, lineWidth: equipped ? 1.5 : 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.vertical, 14)
        }
        .background(StitchPalette.surface)
        .alert(
            shopPreviewItem?.name ?? "상점 아이템",
            isPresented: Binding(get: { shopPreviewItem != nil }, set: { if !$0 { shopPreviewItem = nil } }),
            presenting: shopPreviewItem
        ) { item in
            Button("미리 착용해 보기") { vm.toggleEquipAvatarItem(item) }
            Button("코인 스토어") { vm.showStoreSheet = true }
            Button("닫기", role: .cancel) {}
        } message: { item in
            Text("\(item.categoryLabel) · \(item.price) Play Coin (보유 코인: \(vm.coinBalance))")
        }
    }
}

/// Stitch-aligned Profile & More Tab (`프로필 요약 카드` + 2×2 `메뉴` + `설정 및 계정` + `로그아웃`, Zero Forge).
public struct ProfileMoreView: View {
    @ObservedObject public var vm: PlayHubShellViewModel
    @ObservedObject public var store: StoreKit2Manager
    @State private var showEditProfile = false
    @State private var showAuthSheet = false
    @State private var showPrivacySheet = false
    @State private var showRuntimeSheet = false
    @State private var showLogoutConfirm = false
    @State private var showDeleteAccountConfirm = false

    public init(vm: PlayHubShellViewModel, store: StoreKit2Manager) {
        self.vm = vm
        self.store = store
    }

    private var displayName: String {
        vm.socialProfile?.displayName ?? "PlayHub 플레이어"
    }

    private var handle: String {
        vm.socialProfile?.handle ?? "@guest"
    }

    private var ownedCount: Int {
        AvatarCatalog.items.filter(\.owned).count
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // 1. Profile Summary Card
                VStack(spacing: 14) {
                    HStack(spacing: 12) {
                        ZStack(alignment: .bottomTrailing) {
                            VoxelAvatarCanvas(
                                equippedIds: vm.equippedAvatarIds,
                                accentHex: vm.avatarAccentHex,
                                portraitMode: true
                            )
                            .frame(width: 60, height: 60)
                            .clipShape(Circle())
                            .padding(2)
                            .overlay(Circle().stroke(StitchPalette.playGreen, lineWidth: 2))

                            Circle()
                                .fill(StitchPalette.onlineDot)
                                .frame(width: 15, height: 15)
                                .overlay(Circle().stroke(StitchPalette.surface, lineWidth: 2))
                        }

                        VStack(alignment: .leading, spacing: 3) {
                            Text(displayName)
                                .font(.headline.bold())
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            Text(handle)
                                .font(.caption.monospaced())
                                .foregroundStyle(StitchPalette.onSurfaceVariant)
                                .lineLimit(1)
                        }

                        Spacer()

                        Button("프로필") {
                            showEditProfile = true
                        }
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(StitchPalette.containerHigh, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(StitchPalette.outlineVariant, lineWidth: 1))
                        .foregroundStyle(.white)
                    }

                    Divider().overlay(StitchPalette.outlineVariant)

                    HStack(spacing: 0) {
                        statButton(value: "\(vm.socialFriends.count)", label: "친구", color: .white) {
                            vm.selectedTab = .party
                        }
                        statButton(value: "\(vm.equippedAvatarIds.count)/\(ownedCount)", label: "아이템", color: .white) {
                            vm.selectedTab = .avatar
                        }
                        statButton(value: "\(vm.coinBalance)", label: "코인", color: StitchPalette.coinGold) {
                            vm.showStoreSheet = true
                        }
                    }
                }
                .padding(16)
                .background(StitchPalette.container, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(StitchPalette.outlineVariant, lineWidth: 1))

                // 2. Quick Menu 2x2 Grid (Supported PlayHub Features Only — Zero Forge)
                VStack(alignment: .leading, spacing: 10) {
                    Text("메뉴")
                        .font(.headline.bold())
                        .foregroundStyle(.white)

                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        quickMenuTile(icon: "backpack.fill", title: "인벤토리", badge: "\(ownedCount)") {
                            vm.selectedTab = .avatar
                        }
                        quickMenuTile(icon: "person.3.fill", title: "파티 & 친구", badge: vm.activeParty != nil ? "LIVE" : "\(vm.socialFriends.count)") {
                            vm.selectedTab = .party
                        }
                        quickMenuTile(icon: "trophy.fill", title: "리더보드", badge: "TOP") {
                            if let first = vm.catalogGames.first { vm.leaderboardGame = first }
                        }
                        quickMenuTile(icon: "bitcoinsign.circle.fill", title: "Play Pass", badge: "STORE") {
                            vm.showStoreSheet = true
                        }
                    }
                }

                // 3. Settings & Account Card
                VStack(alignment: .leading, spacing: 10) {
                    Text("설정 및 계정")
                        .font(.headline.bold())
                        .foregroundStyle(.white)

                    VStack(spacing: 0) {
                        Button {
                            showAuthSheet = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "person.crop.circle.badge.checkmark")
                                    .foregroundStyle(StitchPalette.playGreen)
                                    .frame(width: 22)
                                Text("로그인 · 계정 전환 (\(vm.authProvider.uppercased()))")
                                    .font(.subheadline)
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.bold())
                                    .foregroundStyle(StitchPalette.onSurfaceVariant)
                            }
                            .padding(14)
                        }
                        .buttonStyle(.plain)

                        Divider().overlay(StitchPalette.outlineVariant)

                        HStack(spacing: 12) {
                            Image(systemName: "bell.badge.fill")
                                .foregroundStyle(StitchPalette.onSurfaceVariant)
                                .frame(width: 22)
                            Text("친구 접속 및 초대 알림")
                                .font(.subheadline)
                                .foregroundStyle(.white)
                            Spacer()
                            Toggle("", isOn: $vm.pushAlertsEnabled)
                                .labelsHidden()
                                .tint(StitchPalette.playGreen)
                        }
                        .padding(14)

                        Divider().overlay(StitchPalette.outlineVariant)

                        HStack(spacing: 12) {
                            Image(systemName: "person.badge.plus")
                                .foregroundStyle(StitchPalette.onSurfaceVariant)
                                .frame(width: 22)
                            Text("친구 게임 합류 허용")
                                .font(.subheadline)
                                .foregroundStyle(.white)
                            Spacer()
                            Toggle("", isOn: Binding(
                                get: { vm.friendJoinAllowed },
                                set: { vm.setFriendJoinAllowed($0) }
                            ))
                            .labelsHidden()
                            .tint(StitchPalette.playGreen)
                        }
                        .padding(14)

                        Divider().overlay(StitchPalette.outlineVariant)

                        Button {
                            showPrivacySheet = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "shield.fill")
                                    .foregroundStyle(StitchPalette.onSurfaceVariant)
                                    .frame(width: 22)
                                Text("개인정보 및 계정 보안")
                                    .font(.subheadline)
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.bold())
                                    .foregroundStyle(StitchPalette.onSurfaceVariant)
                            }
                            .padding(14)
                        }
                        .buttonStyle(.plain)

                        Divider().overlay(StitchPalette.outlineVariant)

                        Button {
                            showRuntimeSheet = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "questionmark.circle.fill")
                                    .foregroundStyle(StitchPalette.onSurfaceVariant)
                                    .frame(width: 22)
                                Text("고객 지원 및 런타임 정보")
                                    .font(.subheadline)
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.bold())
                                    .foregroundStyle(StitchPalette.onSurfaceVariant)
                            }
                            .padding(14)
                        }
                        .buttonStyle(.plain)
                    }
                    .background(StitchPalette.container, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(StitchPalette.outlineVariant, lineWidth: 1))
                }

                // 4. Dev/Debug-Only Farm Cluster Selector
                if vm.allowFarmSelector {
                    let health = vm.farmHealth[vm.activeFarm.id] ?? FarmHealthResult(status: .checking)
                    Button {
                        vm.showFarmSheet = true
                        Task { await vm.refreshFarmHealth() }
                    } label: {
                        HStack {
                            Image(systemName: "server.rack")
                                .foregroundStyle(StitchPalette.playGreen)
                            Text("Farm 서버군 선택 (\(vm.activeFarm.label))")
                                .font(.subheadline.bold())
                                .foregroundStyle(.white)
                            Spacer()
                            Text(health.compactPillText())
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(StitchPalette.onSurfaceVariant)
                        }
                        .padding(14)
                        .background(StitchPalette.container, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(StitchPalette.playGreen.opacity(0.6), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }

                // 5. Logout Button
                Button {
                    showLogoutConfirm = true
                } label: {
                    Text("로그아웃")
                        .font(.subheadline.bold())
                        .foregroundStyle(StitchPalette.errorRed)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(StitchPalette.container, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(StitchPalette.outlineVariant, lineWidth: 1))
                }
            }
            .padding(16)
        }
        .background(StitchPalette.surface)
        .sheet(isPresented: $showEditProfile) {
            EditProfileSheet(vm: vm)
        }
        .sheet(isPresented: $showAuthSheet) {
            AuthMethodSheet(vm: vm)
        }
        .sheet(isPresented: $showPrivacySheet) {
            privacyAndSecuritySheet
        }
        .sheet(isPresented: $showRuntimeSheet) {
            runtimeSupportSheet
        }
        .alert("로그아웃", isPresented: $showLogoutConfirm) {
            Button("로그아웃", role: .destructive) {
                vm.signOutAndResetGuest()
            }
            Button("취소", role: .cancel) {}
        } message: {
            Text("현재 기기의 세션 토큰을 초기화하고 새 게스트 세션으로 전환할까요?")
        }
    }

    private func statButton(value: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Text(value)
                    .font(.subheadline.bold().monospacedDigit())
                    .foregroundStyle(color)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(StitchPalette.onSurfaceVariant)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func quickMenuTile(icon: String, title: String, badge: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.subheadline)
                    .foregroundStyle(StitchPalette.playGreen)
                Text(title)
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(badge)
                    .font(.caption2.monospaced())
                    .foregroundStyle(badge == "LIVE" ? StitchPalette.playGreen : StitchPalette.onSurfaceVariant)
            }
            .padding(12)
            .background(StitchPalette.container, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(StitchPalette.outlineVariant, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var privacyAndSecuritySheet: some View {
        NavigationStack {
            List {
                Section("연령 보호 · 컴플라이언스") {
                    LabeledContent("연령 티어", value: vm.ageTier.rawValue)
                    LabeledContent("지역", value: vm.regionCode)
                    #if DEBUG
                    if vm.allowFarmSelector {
                        Button("연령 게이트 다시 테스트") {
                            vm.ageGateCompleted = false
                            vm.ageTier = .unknown
                            UserDefaults.standard.removeObject(forKey: "playhub_age_tier")
                            showPrivacySheet = false
                        }
                    }
                    #endif
                }
                Section("결제 복원 · 계정 삭제 (Apple 5.1.1(v))") {
                    Button("구매 복원 (Restore Purchases)") {
                        Task { await store.restorePurchases() }
                    }
                    if vm.isFreeUsbMode {
                        Text("Sign in with Apple / APNs는 유료 Developer(\$99/년) 전환 시 활성화됩니다.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Button("인앱 계정 삭제 요청", role: .destructive) {
                        showDeleteAccountConfirm = true
                    }
                }
            }
            .navigationTitle("개인정보 및 계정 보안")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { showPrivacySheet = false } }
            }
            .alert("계정 삭제 확인", isPresented: $showDeleteAccountConfirm) {
                Button("영구 삭제", role: .destructive) {
                    showPrivacySheet = false
                    Task { await vm.requestAccountDeletion() }
                }
                Button("취소", role: .cancel) {}
            } message: {
                Text("계정과 연동된 프로필·소셜 데이터 삭제를 요청합니다. 이 작업은 되돌릴 수 없습니다.")
            }
        }
    }

    private var runtimeSupportSheet: some View {
        NavigationStack {
            List {
                Section("런타임 정보 (Zero Forge · Runtime Only)") {
                    LabeledContent("Bundle ID", value: Bundle.main.bundleIdentifier ?? "unknown")
                    LabeledContent("Engine", value: "Godot \(vm.engineVersion) (release XCFramework)")
                    LabeledContent("Forge 포함 여부", value: "미포함 (Runtime Only)")
                    LabeledContent("내장 스타터 게임", value: "0종 (100% On-Demand)")
                    if vm.isFreeUsbMode {
                        LabeledContent("서명 모드", value: "무료 Apple ID (USB 7일 갱신)")
                    }
                    LabeledContent("활성 서버", value: vm.activeFarm.baseUrl)
                }
            }
            .navigationTitle("고객 지원 및 런타임 정보")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("닫기") { showRuntimeSheet = false } }
            }
        }
    }
}

public struct EditProfileSheet: View {
    @ObservedObject var vm: PlayHubShellViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var displayName: String = ""
    @State private var bio: String = ""

    public var body: some View {
        NavigationStack {
            Form {
                Section("소셜 핸들") {
                    HStack {
                        Text(vm.socialProfile?.handle ?? "@guest")
                            .font(.subheadline.monospaced())
                        Spacer()
                        Button("복사") {
                            let h = vm.socialProfile?.handle ?? ""
                            UIPasteboard.general.string = h
                            vm.showSocialToast("핸들 복사됨: \(h)")
                        }
                    }
                }
                Section("프로필 정보") {
                    TextField("표시 이름 (2~40자)", text: $displayName)
                    TextField("한 줄 소개", text: $bio)
                }
                Button("저장") {
                    let cleanName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
                    let cleanBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard cleanName.count >= 2 else { return }
                    Task {
                        await vm.updateProfile(displayName: cleanName, bio: cleanBio)
                        dismiss()
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(StitchPalette.playGreen)
            }
            .navigationTitle("프로필 편집")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
            }
            .onAppear {
                displayName = vm.socialProfile?.displayName ?? "Player"
                bio = vm.socialProfile?.bio ?? ""
            }
        }
    }
}

private func colorFromHex(_ hex: String) -> Color {
    let clean = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard clean.count == 6, let val = UInt64(clean, radix: 16) else {
        return StitchPalette.playGreen
    }
    let r = Double((val >> 16) & 0xFF) / 255.0
    let g = Double((val >> 8) & 0xFF) / 255.0
    let b = Double(val & 0xFF) / 255.0
    return Color(red: r, green: g, blue: b)
}

private struct AuthMethodSheet: View {
    @ObservedObject var vm: PlayHubShellViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var isRegister = false
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("소셜 · 게스트 로그인") {
                    Button {
                        if let url = vm.oauthStartURL(provider: "google") {
                            openURL(url)
                        }
                    } label: {
                        HStack {
                            Label("Google로 로그인", systemImage: "g.circle.fill")
                            Spacer()
                            if vm.lastAuthProvider == "google" { recentBadge }
                        }
                    }

                    Button {
                        if let url = vm.oauthStartURL(provider: "naver") {
                            openURL(url)
                        }
                    } label: {
                        HStack {
                            Label("네이버로 로그인", systemImage: "n.circle.fill")
                                .foregroundStyle(Color(red: 0.01, green: 0.78, blue: 0.35))
                            Spacer()
                            if vm.lastAuthProvider == "naver" { recentBadge }
                        }
                    }

                    Button {
                        vm.lastAuthProvider = "guest"
                        UserDefaults.standard.set("guest", forKey: "playhub_last_auth_provider")
                        vm.signOutAndResetGuest()
                        dismiss()
                    } label: {
                        HStack {
                            Label("게스트로 계속하기", systemImage: "person.fill")
                            Spacer()
                            if vm.lastAuthProvider == "guest" { recentBadge }
                        }
                    }
                }

                Section {
                    Picker("모드", selection: $isRegister) {
                        Text("로그인").tag(false)
                        Text("회원가입").tag(true)
                    }
                    .pickerStyle(.segmented)

                    TextField("이메일 (name@example.com)", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    if isRegister {
                        TextField("닉네임 (선택)", text: $displayName)
                    }

                    SecureField(isRegister ? "비밀번호 (8자 이상, 영문+숫자)" : "비밀번호", text: $password)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    Button(busy ? "처리 중…" : (isRegister ? "이메일로 가입하기" : "이메일로 로그인")) {
                        submitEmail()
                    }
                    .disabled(busy || email.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
                } header: {
                    HStack {
                        Text(isRegister ? "이메일 회원가입" : "이메일 로그인")
                        Spacer()
                        if vm.lastAuthProvider == "email" { recentBadge }
                    }
                }
            }
            .navigationTitle("로그인 방식 선택")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }
                }
            }
        }
    }

    private var recentBadge: some View {
        Text("최근 사용")
            .font(.caption2.bold())
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(Color.blue.opacity(0.18), in: Capsule())
            .foregroundStyle(.blue)
    }

    private func submitEmail() {
        busy = true
        errorMessage = nil
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                if isRegister {
                    try await vm.registerWithEmail(
                        email: trimmedEmail,
                        password: password,
                        displayName: trimmedName.isEmpty ? nil : trimmedName
                    )
                } else {
                    try await vm.loginWithEmail(email: trimmedEmail, password: password)
                }
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            busy = false
        }
    }
}
