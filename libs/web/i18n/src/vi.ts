import type { MessageKey } from './en';

// Vietnamese copy, reviewed 2026-11 (issue #67). House style:
// - "nhóm" for the group (trips and sport groups alike); "chuyến đi" only where the copy is about travelling.
// - "link" for a URL; "liên kết" only for linking a sign-in account.
// - "Nhấn" for tap, "Tắt" / "Bật lại" for disable / enable, "Gộp" for merge, "quản trị viên" for admin.
// - "thông tin ngân hàng" for bank details; "tôi" when the user speaks, "bạn" when we speak to them.
// - Spelling: hủy, xóa, hóa (accent on the main vowel), lowercase "nam" / "nữ" inside sentences.
export const vi: Record<MessageKey, string> = {
  'common.retry': 'Thử lại',
  'common.cancel': 'Hủy',
  'common.continue': 'Tiếp tục',
  'common.back': 'Quay lại',
  'common.close': 'Đóng',
  'common.dismiss': 'Bỏ qua',
  'common.undo': 'Hoàn tác',

  'error.generic': 'Có lỗi xảy ra. Hãy thử lại.',
  'error.dailyLimit': 'CoinCrew đang bảo trì. Hãy thử lại sau 07:00.',
  'error.linkDead': 'Link này không còn dùng được. Hãy xin trưởng nhóm link mới.',
  'error.rateLimited': 'Có quá nhiều mục đang chờ duyệt. Hãy nhờ một thành viên duyệt trước.',
  'error.oversell': 'Lần bán sau đó sẽ vượt số đang có ({date})', // REVIEW
  'error.validation': 'Có chỗ chưa đúng. Hãy kiểm tra rồi thử lại.', // REVIEW
  'validation.signInExpired': 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', // REVIEW
  'validation.nameLength': 'Hãy nhập tên, tối đa 40 ký tự.', // REVIEW
  'validation.groupNameLength': 'Hãy nhập tên nhóm, tối đa 60 ký tự.', // REVIEW
  'validation.descriptionLength': 'Hãy nhập nội dung, tối đa 80 ký tự.', // REVIEW
  'validation.reasonLength': 'Hãy nhập lý do, tối đa 140 ký tự.', // REVIEW
  'validation.amountInvalid': 'Hãy kiểm tra lại số tiền rồi thử lại.', // REVIEW
  'validation.rateSelf': 'Bạn không thể tự chấm sao cho mình.', // REVIEW
  'validation.pickDifferentPeople': 'Hãy chọn hai người khác nhau.', // REVIEW
  'validation.mergeSelf': 'Bạn không thể gộp với chính mình.', // REVIEW
  'validation.bothSignedIn': 'Cả hai người đều có tài khoản riêng nên không gộp được.', // REVIEW
  'validation.payToSelf': 'Người trả và người nhận phải là hai người khác nhau.', // REVIEW
  'validation.pendingFromFund': 'Khoản chi đang chờ duyệt chưa thể trả từ quỹ nhóm. Hãy duyệt trước.', // REVIEW
  'validation.tooManyGroups': 'Có quá nhiều nhóm cùng lúc. Hãy thanh toán từng nhóm một.', // REVIEW
  'validation.bankAccountNumber': 'Hãy nhập số tài khoản từ 6 đến 19 chữ số.', // REVIEW
  'validation.bankHolderName': 'Hãy nhập tên chủ tài khoản.', // REVIEW
  'validation.genderRequired': 'Hãy chọn nam hoặc nữ để vào nhóm này.', // REVIEW
  'validation.mapUrl': 'Hãy nhập link bản đồ bắt đầu bằng http:// hoặc https://.', // REVIEW
  'validation.imageTooLarge': 'Ảnh này quá lớn. Hãy thử ảnh nhỏ hơn.', // REVIEW

  'noAccess.title': 'Bạn chưa có quyền vào nhóm này',
  'noAccess.body': 'Đăng nhập nếu bạn là thành viên, hoặc mở link mời mà nhóm đã gửi cho bạn.',

  'lang.vi': 'Tiếng Việt',
  'lang.en': 'English',
  'lang.switchTo': 'Chuyển sang {lang}',

  'time.justNow': 'vừa xong',
  'time.minutesAgo': '{n} phút trước',
  'time.hoursAgo': '{n} giờ trước',
  'time.daysAgo': '{n} ngày trước',

  'fewest.title': 'Ít lần chuyển khoản nhất',
  'fewest.explain': 'Gom các khoản nợ của mọi người lại để số lần chuyển khoản ít nhất có thể. Tổng số tiền mỗi người phải trả vẫn giữ nguyên.',

  'roundTransfers.title': 'Làm tròn số tiền chuyển khoản',
  'roundTransfers.explain': 'Làm tròn số tiền chuyển khoản gợi ý và mã QR đến 1.000 ₫ gần nhất.',

  'who.lastUsedHere': 'Lần trước bạn đã chọn tên này trên điện thoại này',
  'who.activeElsewhere': 'Đang dùng trên điện thoại khác · {ago}',
  'who.areYou': 'Bạn là {name} phải không?',
  'who.yesIm': 'Đúng, tôi là {name}',
  'who.noAddMe': 'Không phải, thêm tôi vào',

  'expenses.disabledBy': '{name} đã tắt khoản này',
  'expense.sendForApproval': 'Gửi chờ duyệt',

  'approvals.paidYou': '{name} báo đã chuyển cho bạn {amount}',
  'approvals.didItArrive': 'Bạn đã nhận được tiền chưa?',

  'pay.payWithVietQr': 'Thanh toán bằng VietQR',
  'pay.keepNote': 'Giữ nguyên nội dung chuyển khoản để người nhận biết bạn trả khoản nào.',
  'pay.bankPending': 'Thông tin ngân hàng của {name} đang chờ duyệt',
  'pay.bankNone': '{name} chưa thêm thông tin ngân hàng',
  'pay.openBankApp': 'Mở ứng dụng ngân hàng',
  'pay.openApp': 'Mở {app}',
  'pay.switchBank': 'Đổi ngân hàng',
  'pay.downloadQr': 'Tải mã QR',
  'pay.pickBank': 'Chọn ngân hàng của bạn',
  'pay.searchBank': 'Tìm: vcb, techcom, Á Châu…',
  'pay.recentBank': 'Dùng gần đây',
  'pay.popularBanks': 'Phổ biến',
  'pay.noBankMatch': 'Không tìm thấy ngân hàng "{q}"',

  'landing.headline': 'Chia tiền chuyến đi. Trả nhau bằng VietQR.',
  'landing.tagline': 'Bạn bè vào từ một link trong nhóm chat, không cần tài khoản.',
  'landing.signIn': 'Đăng nhập bằng Google',
  'landing.howItWorks': 'Cách hoạt động',
  'landing.step1': 'Tạo chuyến đi',
  'landing.step1Body': 'Thêm những ai đi cùng.',
  'landing.step2': 'Gửi một link',
  'landing.step2Body': 'Mỗi người tự thêm khoản mình đã trả.',
  'landing.step3': 'Trả nhau bằng VietQR',
  'landing.step3Body': 'Chuyển khoản cho nhau bằng mã VietQR.',

  'trips.title': 'Nhóm của bạn',
  'trips.new': 'Tạo nhóm mới',
  'trips.emptyTitle': 'Tạo nhóm đầu tiên của bạn',
  'trips.emptyBody': 'Tạo nhóm đi chơi hoặc nhóm thể thao, rồi gửi một link cho cả nhóm.',
  'trips.youreOwed': 'Bạn được nhận',
  'trips.youOwe': 'Bạn cần trả',
  'trips.settled': 'Đã thanh toán xong',
  'trips.archived': 'đã lưu trữ',
  'trips.deleteInOneDay': 'Xóa sau 1 ngày', // REVIEW
  'trips.deleteInDays': 'Xóa sau {days} ngày', // REVIEW
  'trips.deleteToday': 'Xóa trong hôm nay', // REVIEW

  'account.label': 'Tài khoản',
  'account.language': 'Ngôn ngữ',
  'account.signOut': 'Đăng xuất',
  'account.changePhoto': 'Đổi ảnh đại diện',
  'account.cropTitle': 'Cắt & chỉnh ảnh đại diện',
  'account.zoom': 'Thu phóng',
  'account.savePhoto': 'Lưu ảnh',
  'account.removePhoto': 'Xóa ảnh',
  'account.saveProfile': 'Lưu hồ sơ',
  'account.displayName': 'Tên hiển thị',
  'account.gender': 'Giới tính',
  'account.book': 'Sổ chi tiêu', // REVIEW
  'account.bookHint': 'Ghi lại tiền của riêng bạn, cùng chỗ với các nhóm.', // REVIEW
  'account.bookBeta': 'Thử nghiệm', // REVIEW
  'account.reloadData': 'Tải lại dữ liệu', // REVIEW
  'account.reloadDataHint': 'Tải lại giao dịch đã lưu trên máy này', // REVIEW
  'account.reloadDataStarted': 'Đang tải lại dữ liệu…', // REVIEW
  'trips.accountAria': 'Tài khoản',
  'trips.signOut': 'Đăng xuất',

  'home.title': 'Khoản chi nhanh',
  'home.totalOwed': 'Mọi người nợ bạn · tất cả nhóm',
  'home.totalOwe': 'Bạn nợ {amount}',
  'home.byPerson': 'Theo từng người · tất cả nhóm',
  'home.tabPeople': 'Mọi người',
  'home.tabGroups': 'Nhóm',
  'home.tabActivity': 'Hoạt động',
  'home.newExpense': 'Thêm khoản chi',
  'home.owedToYou': 'Nợ bạn',
  'home.youOwe': 'Bạn nợ',
  'home.peopleEmptyTitle': 'Chưa có khoản nợ nào',
  'home.peopleEmptyBody': 'Thêm một khoản chi và chọn người cùng chia.',
  'home.stillCounting': 'Vẫn đang tính thêm vài nhóm…',
  'home.waiting': 'Đang chờ bạn xác nhận',

  'book.title': 'Sổ chi tiêu', // REVIEW
  'book.emptyTitle': 'Bắt đầu bằng một chiếc ví', // REVIEW
  'book.emptyBody': 'Ví là nơi bạn giữ tiền: tiền mặt, tài khoản ngân hàng, quỹ đầu tư. Tạo ví đầu tiên để bắt đầu.', // REVIEW
  'book.createWallet': 'Tạo ví đầu tiên', // REVIEW
  'book.walletSheetTitle': 'Ví đầu tiên của bạn', // REVIEW
  'book.walletSheetBody': 'Ví này sẽ là ví mặc định. Các khoản chi nhanh và phần của bạn trong nhóm sẽ được ghi vào đây.', // REVIEW
  'book.walletName': 'Tên ví', // REVIEW
  'book.walletNameDefault': 'Tiền mặt', // REVIEW
  'book.walletAmount': 'Bạn đang có bao nhiêu?', // REVIEW
  'book.walletAmountHint': 'Để trống nếu muốn bắt đầu từ 0₫.', // REVIEW
  'book.walletCreate': 'Tạo ví', // REVIEW
  'book.total': 'Tổng tiền', // REVIEW
  'book.peopleOwe': 'Mọi người nợ bạn', // REVIEW
  'book.peopleTitle': 'Mọi người', // REVIEW
  'book.reportsTitle': 'Báo cáo', // REVIEW
  'book.reportsDesc': 'Thu & chi theo danh mục, thẻ', // REVIEW
  'book.monthSpent': 'Tháng này chi', // REVIEW
  'book.monthIncome': 'Thu', // REVIEW

  'person.title': 'Chi tiết',
  'person.owesYou': 'Nợ bạn',
  'person.youOwe': 'Bạn nợ',
  'person.settled': 'Đã thanh toán xong',
  'person.quickExpenses': 'Khoản chi nhanh',
  'person.request': 'Yêu cầu trả',
  'person.settleUp': 'Thanh toán',
  'person.paidInCash': 'Đã trả tiền mặt',
  'person.paidInCashTitle': '{name} đã trả bạn bao nhiêu?',
  'person.amountLabel': 'Số tiền',
  'person.save': 'Lưu',
  'person.linkCopied': 'Đã sao chép link',
  'person.shareTitle': '{owner} nhờ bạn trả tiền',
  'person.saysPaid': '{name} báo đã trả {amount}',
  'person.recordedFromYou': '{name} đã ghi nhận {amount} từ bạn',
  'person.confirm': 'Xác nhận',
  'person.nickname': 'Biệt danh',
  'person.nicknameHelp': 'Chỉ mình bạn thấy.',
  'person.edit': 'Sửa',
  'person.guestIn': 'Khách trong {group}',
  'person.nameIn': 'Tên trong {group}',
  'person.saved': 'Đã lưu',
  'history.title': 'Gồm những khoản nào',
  'history.betweenYou': 'Giữa hai bạn',
  'history.rerouted': 'Để bớt lượt chuyển, nhóm đổi số này thành {amount}.',
  'history.reroutedVia': '{amount} được chuyển sang {name} để bớt lượt chuyển.',
  'history.rounded': 'Làm tròn đến 1.000₫',
  'history.paidBy': '{name} trả {amount}',
  'history.shares': 'Bạn {mine} · {name} {theirs}',
  'history.youPaid': 'Bạn đã trả {name}',
  'history.theyPaid': '{name} đã trả bạn',
  'history.waiting': 'Đang chờ',
  'history.notApproved': 'Chờ duyệt',
  'history.inTheirLedger': 'Trong sổ của {name}',
  'history.seeAll': 'Xem tất cả với {name}',
  'history.seeHistory': 'Xem lịch sử với {name}',
  'history.covers': '{names} và {count} khoản khác',
  'history.total': 'Tổng',
  'history.openGroup': 'Mở {group}',
  'person.samePerson': 'Cùng một người?',
  'person.samePersonHelp': 'Gộp lại để cộng chung số tiền. Chỉ mình bạn thấy.',
  'person.mergeWith': 'Gộp với…',
  'person.mergeHelp': 'Ở đây họ sẽ thành một người, với một tổng chung. Các nhóm của bạn không thay đổi.',
  'person.mergeBothSignedIn': 'Cả hai đều có tài khoản',
  'person.unmerge': 'Tách {name} ra',
  'person.merged': 'Đã gộp',
  'person.unmerged': 'Đã tách {name} ra',
  'person.linkedTitle': 'Đã gộp vào đây',
  'person.notFound': 'Không còn khoản nào chưa xong với người này.',
  'person.notReceived': 'Chưa nhận được',
  'person.payTitle': 'Trả cho {name}',
  'person.paidThem': 'Tôi đã trả',
  'person.noBank': '{name} chưa thêm thông tin ngân hàng. Hãy trả bằng cách khác rồi nhấn "Tôi đã trả".',
  'quick.fromGroups': 'Từ các nhóm của bạn',
  'quick.addName': 'Thêm “{name}” là người mới',
  'quick.addFailed': 'Chưa thêm được. Hãy thử lại.',
  'request.title': 'Yêu cầu thanh toán',
  'request.askedYou': '{owner} nhờ bạn trả',
  'request.youOwe': 'Bạn nợ {owner}',
  'request.ownerOwes': '{owner} nợ bạn',
  'request.settled': 'Bạn và {owner} đã hết nợ nhau',
  'request.noBank': '{owner} chưa thêm thông tin ngân hàng — hãy trả trực tiếp.',
  'request.paid': 'Tôi đã trả',
  'request.cashHint': 'Trả tiền mặt? Báo {owner} để họ đánh dấu.',
  'request.waiting': 'Đang chờ {owner} xác nhận',
  'request.quickExpenses': 'Khoản chi với {owner}',
  'request.covers': 'Gồm những khoản nào ({count})',
  'request.notFound': 'Link này không còn dùng được. Hãy xin link mới.',
  'trip.tabExpenses': 'Chi tiêu',
  'trip.tabPayments': 'Thanh toán',
  'trip.tabs': 'Các tab của nhóm',
  'people.genderMale': 'Nam',
  'people.genderFemale': 'Nữ',

  'create.title': 'Tạo nhóm mới',
  'create.tripName': 'Tên nhóm',
  'create.tripNamePlaceholder': 'Đà Lạt · 10/2026',
  'create.presetLabel': 'Loại nhóm',
  'create.presetTrip': 'Chuyến đi / Chi tiêu chung',
  'create.presetSport': 'Nhóm thể thao',
  'create.sportNamePlaceholder': 'Cầu lông tối thứ 5',
  'create.myName': 'Tên của bạn',
  'create.others': 'Còn ai tham gia? (không bắt buộc)',
  'create.otherPlaceholder': 'Tên',
  'addBar.nameLabel': 'Tên người cần thêm',
  'addBar.add': '+ Thêm',
  'addBar.addM': '+ Nam',
  'addBar.addF': '+ Nữ',
  'addBar.added': 'Đã thêm {name}',
  'addBar.addedWithGender': 'Đã thêm {name} · {gender}',
  'addBar.addedMany': 'Đã thêm {count} người',
  'addBar.addedManyWithSkipped': 'Đã thêm {count} người (bỏ qua {skipped} tên trùng)',
  'addBar.duplicateHint': 'Tên này đã có trong nhóm. Thêm họ hoặc biệt danh để dễ phân biệt.',
  'create.removePerson': 'Xóa {name}',
  'create.bankTitle': 'Thông tin ngân hàng của bạn (không bắt buộc)',
  'create.bankHint': 'Để bạn bè chuyển khoản trả bạn qua VietQR. Bạn có thể thêm sau.',
  'create.submit': 'Tạo nhóm',
  'create.suggestTitle': 'Từ các nhóm gần đây',
  'create.hasAccount': '{name} · có tài khoản',
  'create.alreadyListed': '{name} đã có trong danh sách với tài khoản của họ.',

  'gender.label': 'Giới tính của {name}',
  'gender.pillM': 'Nam',
  'gender.pillF': 'Nữ',
  'gender.pillLabel': 'Giới tính của {name}: {gender}',
  'gender.set': 'Chọn giới tính',
  'gender.setFor': 'Chọn giới tính cho {name}',
  'gender.changed': '{name} · {gender}',

  'bank.bank': 'Ngân hàng',
  'bank.popular': 'Phổ biến',
  'bank.allBanks': 'Tất cả ngân hàng',
  'bank.choose': 'Chọn ngân hàng',
  'bank.search': 'Tìm ngân hàng',
  'bank.noResults': 'Không tìm thấy ngân hàng',
  'bank.accountNumber': 'Số tài khoản',
  'bank.holderName': 'Tên chủ tài khoản',
  'bank.holderHint': 'Ghi đúng như ngân hàng hiển thị, không dấu.',

  'consent.title': 'Trước khi bắt đầu',
  'consent.body': 'Chúng tôi lưu tên, email, các nhóm bạn tham gia và thông tin ngân hàng bạn thêm, để cả nhóm có thể chia tiền và trả tiền cho nhau.',
  'consent.agree': 'Tôi đồng ý với thông báo quyền riêng tư',
  'consent.readNotice': 'Đọc thông báo quyền riêng tư',

  'privacy.title': 'Thông báo quyền riêng tư',
  'privacy.draft': 'Bản nháp — đang chờ duyệt pháp lý',
  'privacy.summary.badge': '🌱 Tóm tắt nhanh',
  'privacy.summary.readTime': 'Đọc trong 30 giây',
  'privacy.summary.lead': 'CoinCrew chỉ lưu tên và số tài khoản ngân hàng để giúp các nhóm chia tiền và tạo mã VietQR thanh toán. Chúng tôi không bao giờ bán dữ liệu, không chạy quảng cáo, và bạn có thể xóa dữ liệu của mình bất cứ lúc nào.',
  'privacy.sectionLabel': 'Chi tiết theo quy định (Nghị định 13/2023 & Luật Bảo vệ dữ liệu cá nhân 2026)',
  'privacy.sections.operator.title': '1. Đơn vị vận hành',
  'privacy.sections.operator.body': 'CoinCrew (Tiền Đâu) được vận hành độc lập, là công cụ giúp nhóm chia chi phí và tạo mã VietQR để các thành viên chuyển khoản trực tiếp cho nhau.',
  'privacy.sections.data.title': '2. Dữ liệu thu thập & phân loại',
  'privacy.sections.data.basicLabel': 'Dữ liệu cá nhân cơ bản',
  'privacy.sections.data.basicBody': 'Tên và địa chỉ email khi đăng nhập bằng Google, hoặc Zalo user ID, tên hiển thị và ảnh đại diện khi đăng nhập bằng Zalo (Zalo không chia sẻ số điện thoại của bạn); tên nhóm, tên người tham gia, lịch sử chi tiêu và thanh toán.',
  'privacy.sections.data.sensitiveLabel': 'Dữ liệu cá nhân nhạy cảm (Điều 2.4 NĐ 13/2023/NĐ-CP)',
  'privacy.sections.data.sensitiveBody': 'Tên ngân hàng (hoặc mã BIN), số tài khoản và tên chủ tài khoản dùng để tạo mã chuyển khoản VietQR. Người nhập thông tin ngân hàng thay cho người khác phải được người đó đồng ý.',
  'privacy.sections.sharing.title': '3. Ai thấy thông tin của bạn?',
  'privacy.sections.sharing.body': 'Thành viên cùng nhóm có thể xem tên và các khoản chi. Thông tin tài khoản ngân hàng của bạn chỉ hiện cho người cần chuyển tiền cho bạn, khi họ mở màn hình thanh toán VietQR.',
  'privacy.sections.processors.title': '4. Hạ tầng lưu trữ & bên thứ ba',
  'privacy.sections.processors.body': 'Dữ liệu được lưu trên hạ tầng điện toán đám mây của Cloudflare (Workers & D1 Database). Dịch vụ đăng nhập do Google và VNG Zalo cung cấp. Máy chủ và nơi lưu trữ có thể đặt ngoài lãnh thổ Việt Nam.',
  'privacy.sections.risks.title': '5. Rủi ro ngoài ý muốn',
  'privacy.sections.risks.body': 'Bất kỳ ai có link tham gia nhóm (/j/...) đều có thể xem lịch sử chi tiêu của nhóm. Việc chuyển khoản đúng người phụ thuộc vào thông tin tài khoản do người dùng nhập.',
  'privacy.sections.retention.title': '6. Thời gian lưu trữ dữ liệu',
  'privacy.sections.retention.body': 'Dữ liệu được lưu cho đến khi bạn xóa nhóm, xóa thông tin ngân hàng hoặc yêu cầu xóa tài khoản.',
  'privacy.sections.rights.title': '7. Quyền của bạn theo quy định pháp luật',
  'privacy.sections.rights.body': 'Bạn có đầy đủ 11 quyền theo Điều 9 Nghị định 13/2023 và Luật Bảo vệ dữ liệu cá nhân 2026: quyền được biết, đồng ý, truy cập, chỉnh sửa, xóa dữ liệu, rút lại sự đồng ý, hạn chế xử lý, nhận dữ liệu, phản đối xử lý, khiếu nại, tố cáo và yêu cầu bồi thường thiệt hại.',
  'privacy.sections.contact.title': '8. Liên hệ & yêu cầu xóa dữ liệu',
  'privacy.sections.contact.body': 'Để hỏi về quyền riêng tư, thực hiện các quyền về dữ liệu hoặc yêu cầu xóa hẳn tài khoản, vui lòng liên hệ qua email:',

  'join.opening': 'Đang mở nhóm…',

  'who.title': 'Bạn là ai?',
  'who.subtitle': 'Chọn tên của bạn để tiếp tục.',
  'who.continueAs': 'Tiếp tục với tên {name}',
  'who.hasAccount': 'Đã có tài khoản · nhấn để đăng nhập',
  'who.search': 'Tìm tên',
  'who.clearSearch': 'Xóa tìm kiếm',
  'who.count': '{shown}/{total} người',
  'who.addNamed': 'Không có trong danh sách? Thêm "{name}"',
  'who.pending': 'Đang chờ duyệt',
  'who.nameLabel': 'Tên của bạn',
  'who.inTrip': 'Đã có trong nhóm này',
  'who.similar': '"{typed}" có vẻ giống "{name}", người đã có trong nhóm này.',
  'who.joinAs': 'Không có trong danh sách? Tham gia với tên {name}',
  'who.joinButton': 'Tham gia với tên {name}',
  'who.rejoinAs': 'Vào lại với tên {name}',
  'who.playAs': 'Bạn chơi suất',
  'who.playAsHint': 'Dùng để chia tiền sân. Bạn có thể đổi sau.',
  'who.rejoinHint': 'Bạn đã rời nhóm này · các khoản chi trước đây vẫn còn',
  'who.nameOrFriend': '{name} hoặc bạn của {name}',
  'who.slots': '{n} suất',

  'guest.viewingAs': 'Đang xem với tư cách {name}',
  'guest.switch': 'Không phải {name}? Đổi người',
  'guest.ifApprovedOwe': 'Nếu các khoản chi của bạn được duyệt, bạn sẽ cần trả {amount}',
  'guest.ifApprovedOwed': 'Nếu các khoản chi của bạn được duyệt, bạn sẽ được nhận {amount}',
  'guest.ifApprovedSettled': 'Nếu các khoản chi của bạn được duyệt, bạn sẽ hết nợ',
  'guest.yourShare': 'Phần của bạn được tính thế nào',
  'guest.yourTotal': 'Tổng của bạn',
  'guest.becomeMember': 'Đăng nhập bằng Google để trở thành thành viên',
  'guest.memberRequested': 'Bạn đã xin trở thành thành viên. Một thành viên sẽ duyệt yêu cầu này.',

  'trip.total': 'Tổng chi {amount}',
  'trip.people': '{n} người',
  'trip.balances': 'Số dư',
  'trip.expenses': 'Khoản chi',
  'trip.addExpense': '+ Thêm khoản chi',
  'trip.pays': '{from} → {to}',
  'trip.viewOnly': 'Chỉ xem',
  'trip.you': 'Bạn',
  'trip.allSettled': 'Mọi người đã thanh toán xong.',
  'trip.deleteBannerHeadlineOneDay': 'Nhóm sẽ bị xóa vĩnh viễn sau 1 ngày ({date})', // REVIEW
  'trip.deleteBannerHeadline': 'Nhóm sẽ bị xóa vĩnh viễn sau {days} ngày ({date})', // REVIEW
  'trip.deleteBannerHeadlineToday': 'Xóa trong hôm nay', // REVIEW
  'trip.deleteBannerBookNote': 'Giao dịch đã ngừng tính vào Sổ chi tiêu.', // REVIEW

  'expense.youPaid': 'Bạn đã trả',
  'expense.personPaid': '{name} đã trả',
  'split.equal': 'chia đều {n} người',
  'split.amounts': 'theo số tiền',
  'split.percent': 'theo phần trăm',
  'split.shares': 'theo số phần',
  'split.adjust': 'có điều chỉnh',
  'split.sport': 'chia theo buổi chơi',
  'status.waiting': 'Đang chờ',
  'status.rejected': 'Bị từ chối',
  'status.disabled': 'Đã tắt',
  'expense.rejectedBecause': 'Bị từ chối: {reason}',

  'expenseForm.titleNew': 'Thêm khoản chi',
  'expenseForm.titleEdit': 'Sửa khoản chi',
  'expenseForm.whatFor': 'Nội dung',
  'expenseForm.whatForPlaceholder': 'Bánh tráng nướng, chợ đêm',
  'expenseForm.amount': 'Số tiền',
  'expenseForm.amountHint': 'Bạn có thể nhập 180.000, 50k hoặc 1,5tr.',
  'expenseForm.amountInvalid': 'Nhập số tiền, ví dụ 180.000, 50k hoặc 1,5tr.',
  'expenseForm.date': 'Ngày',
  'expenseForm.paidBy': 'Người trả',
  'expenseForm.me': '{name} (tôi)',
  'expenseForm.choosePayer': 'Chọn người trả',
  'expenseForm.peopleLeft': '{names} đã rời nhóm nên được bỏ khỏi khoản chi này.',
  'expenseForm.personLeft': 'Có người trong khoản chi này đã rời nhóm. Kiểm tra lại cách chia rồi thử lại.',
  'expenseForm.split': 'Cách chia',
  'expenseForm.include': 'Tính cả {name}',
  'expenseForm.amountFor': 'Số tiền của {name}',
  'expenseForm.percentFor': 'Phần trăm của {name}',
  'expenseForm.sharesFor': 'Số phần của {name}',
  'expenseForm.adjustFor': 'Điều chỉnh cho {name}',
  'expenseForm.add': 'Thêm khoản chi',
  'expenseForm.save': 'Lưu thay đổi',
  'expenseForm.guestNote': 'Một thành viên trong nhóm sẽ duyệt trước khi khoản này được tính.',
  'split.tab.equal': 'Chia đều',
  'split.tab.sport': 'Chia theo buổi chơi',
  'split.mode.equal': 'Chia đều',
  'split.mode.exact': 'Theo số tiền',
  'split.mode.percent': 'Phần trăm',
  'split.mode.shares': 'Số phần',
  'split.mode.adjust': 'Điều chỉnh',
  'split.mode.sport': 'Thể thao',
  'split.captionEqual': 'Chia đều · {n} người · mỗi người {each}',
  'split.captionEqualAbout': 'Chia đều · {n} người · mỗi người khoảng {each}',
  'split.captionEqualNone': 'Chia đều · {n} người',
  'split.captionExact': 'Theo số tiền · {n} người',
  'split.captionExactLeft': 'Theo số tiền · {n} người · còn {amount} chưa chia',
  'split.captionExactOver': 'Theo số tiền · {n} người · thừa {amount}',
  'split.captionPercent': 'Theo phần trăm · {n} người',
  'split.captionPercentLeft': 'Theo phần trăm · {n} người · còn {pct}%',
  'split.captionPercentOver': 'Theo phần trăm · {n} người · thừa {pct}%',
  'split.captionShares': 'Theo số phần · {n} người',
  'split.captionAdjust': 'Chia đều có điều chỉnh · {n} người',
  'split.captionPercentShare': 'Theo phần trăm · {n} người · {k} người chia {pct}% còn lại',
  'split.captionPercentLeftFor': 'Theo phần trăm · {n} người · còn {pct}% cho {name}',
  'split.captionPercentNothing': 'Theo phần trăm · {n} người · {k} người không phải trả',
  'split.captionPercentNothingOne': 'Theo phần trăm · {n} người · {name} không phải trả',
  'split.captionExactShare': 'Theo số tiền · {n} người · {k} người chia {amount} còn lại',
  'split.captionExactLeftFor': 'Theo số tiền · {n} người · còn {amount} cho {name}',
  'split.captionExactNothing': 'Theo số tiền · {n} người · {k} người không phải trả',
  'split.captionExactNothingOne': 'Theo số tiền · {n} người · {name} không phải trả',
  'splitBetween.label': 'Chia cho · {n}/{total} người',
  'splitBetween.everyone': 'Chia cho · Mọi người ({n})',
  'splitBetween.empty': 'Chia cho', // REVIEW
  'splitBetween.count': 'Chia cho {n} người', // REVIEW
  'splitBetween.none': 'Chưa chọn ai',
  'splitBetween.change': 'Đổi',
  'splitBetween.you': 'Bạn',
  'splitBetween.aria': '{label}. {names}. Đổi',
  'splitSheet.title': 'Chia cho',
  'splitSheet.count': '{n}/{total} người',
  'splitSheet.recent': 'Chọn lại như khoản trước',
  'splitSheet.recentMeta': '{date} · {n} người · {names}',
  'splitSheet.more': '+{n}',
  'splitSheet.use': 'Dùng',
  'splitSheet.useAria': 'Dùng danh sách người của {description}',
  'splitSheet.clearAll': 'Bỏ chọn hết',
  'splitSheet.addEveryone': 'Chọn cả nhóm',
  'splitSheet.searchLabel': 'Thêm người',
  'splitSheet.searchPlaceholder': 'Thêm người…',
  'splitSheet.remove': 'Bỏ {name}',
  'splitSheet.add': 'Thêm {name}',
  'splitSheet.alreadyIn': 'Đã chọn: {names}',
  'splitSheet.noMatch': 'Trong nhóm không có ai tên "{q}".',
  'splitSheet.allChosen': 'Đã chọn tất cả mọi người trong nhóm.',
  'splitSheet.matches': '{n} kết quả',
  'splitSheet.done': 'Xong',
  'expense.notYours': 'Chỉ người đã thêm khoản chi này mới sửa được.',
  'expense.historyTitle': 'Lịch sử chỉnh sửa',
  'expense.rollback': 'Khôi phục về phiên bản này',
  'expense.editedBy': '{name} đã sửa · {date}',
  'splitError.NO_PARTICIPANTS': 'Chọn ít nhất một người.',
  'splitError.INVALID_AMOUNT': 'Nhập số tiền trước.',
  'splitError.AMOUNTS_DONT_ADD_UP': 'Các số tiền cộng lại không bằng tổng.',
  'splitError.PERCENT_NOT_100': 'Tổng phần trăm phải bằng 100%.',
  'splitError.SHARES_NOT_POSITIVE': 'Mỗi phần phải lớn hơn 0.',
  'splitError.NEGATIVE_SHARE': 'Phần điều chỉnh lớn hơn tổng số tiền.',

  'sport.whatForPlaceholder': 'Cầu lông tối thứ 5 · Sân 3',
  'sport.costsTitle': 'Chi phí buổi chơi',
  'sport.court': 'Tiền sân',
  'sport.shuttlecocks': 'Tiền cầu',
  'sport.qty': 'SL',
  'sport.unitPrice': 'Đơn giá',
  'sport.addShuttlePrice': '+ Thêm giá cầu',
  'sport.addShuttlecock': 'Thêm giá cầu',
  'sport.addExtraFee': 'Thêm phụ phí',
  'sport.removeShuttleRow': 'Xóa dòng tiền cầu {n}',
  'sport.removeExtraFee': 'Xóa phụ phí',
  'sport.extra': 'Phụ phí (nước, gửi xe…)',
  'sport.totalBar': '{slots} suất ({f} Nữ, {m} Nam)',
  'sport.totalLabel': 'Tổng cộng',
  'sport.ruleTitle': 'Cách tính nam / nữ',
  'sport.ruleEqual': 'Như nhau',
  'sport.ruleDiscount': 'Chênh tiền',
  'sport.ruleRatio': 'Tỷ lệ',
  'sport.femaleDiscountLabel': 'Nữ được giảm mỗi suất',
  'sport.maleWeightLabel': 'Hệ số nam',
  'sport.femaleWeightLabel': 'Hệ số nữ',
  'sport.slotSummary': 'Nam: {m} · Nữ: {f}',
  'sport.slotsBadge': '{f} Nữ · {m} Nam',
  'sport.oneMale': '1 Nam',
  'sport.oneFemale': '1 Nữ',
  'sport.fixedBadge': 'Cố định',
  'sport.femaleSlotsFor': 'Số suất nữ của {name}',
  'sport.maleSlotsFor': 'Số suất nam của {name}',
  'sport.sameAsFemale': '= giá nữ',
  'sport.fixedFor': 'Số tiền cố định của {name}',
  'sport.clearFixed': 'Bỏ số tiền cố định của {name}',
  'sport.bringsGuest': 'Người chơi này có dẫn khách không?',
  'sport.femaleGuest': 'Khách nữ',
  'sport.maleGuest': 'Khách nam',
  'sport.orFixedAmount': 'Hoặc đặt số tiền cố định cho {name}',
  'sport.editGender': 'Đổi giới tính',
  'sport.shareBillQr': 'Chia sẻ bill & QR',
  'sport.shareCopied': 'Đã sao chép tin nhắn và link. Dán vào nhóm chat nhé.',
  'sport.zaloPreviewTitle': 'Tin nhắn Zalo & ảnh bill',
  'sport.tableColName': 'TÊN',
  'sport.tableColFemale': 'NỮ',
  'sport.tableColMale': 'NAM',
  'sport.tableColAmount': 'THÀNH TIỀN',
  'sport.tableTotalSlots': 'TỔNG SUẤT',
  'sport.tableCosts': 'CHI PHÍ',
  'sport.tablePerSlot': 'MỖI SUẤT',
  'sport.planSession': 'Lên lịch buổi chơi',
  'sport.planningBadge': 'Lên lịch',
  'sport.completeSession': 'Hoàn tất & chia tiền',
  'sport.sharePlanning': 'Chia sẻ lịch & danh sách',
  'sport.includeProofImage': 'Gửi kèm ảnh đặt sân',
  'sport.extractFromImage': '✨ Tự điền từ ảnh đặt sân',
  'sport.extracting': 'Đang đọc ảnh đặt sân…',
  'sport.locationLabel': 'Địa điểm',
  'sport.addLocation': '+ Thêm địa điểm mới',
  'sport.locationName': 'Tên sân',
  'sport.locationAddress': 'Địa chỉ',
  'sport.locationPhone': 'Số điện thoại',
  'sport.locationMapUrl': 'Link Google Maps',
  'sport.openMap': 'Mở bản đồ ↗',
  'sport.courtSlotsLabel': 'Sân & khung giờ',
  'sport.addCourtSlot': '+ Thêm sân',
  'sport.courtNamePlaceholder': 'VD: Sân 6',
  'sport.timeRangePlaceholder': 'VD: 05:00 - 07:00',
  'sport.startTimeLabel': 'Giờ bắt đầu',
  'sport.durationLabel': 'Thời lượng',
  'sport.courtNameIndex': 'Tên sân {index}',
  'sport.timeRangeIndex': 'Khung giờ sân {index}',
  'sport.removeCourtIndex': 'Xóa sân {index}',
  'sport.calculatedRange': 'Khung giờ tính được: {range}',
  'sport.totalDurationBanner': 'Thời lượng: {duration} ({range}) · {courts} sân',
  'sport.courtCount': '{count} sân',
  'sport.defaultCourtName': 'Sân {index}',
  'sport.bookingCodeLabel': 'Mã đặt sân',
  'sport.bookingCodePlaceholder': 'VD: BK-4139',
  'sport.totalDurationLabel': 'Thời lượng',
  'sport.totalDurationPlaceholder': 'VD: 2h',
  'sport.durationSuggestion': 'Gợi ý: {duration}',
  'sport.bookingCodeFact': 'Mã đặt sân',
  'sport.totalDurationFact': 'Thời lượng',
  'sport.savePlanning': 'Lưu lịch dự kiến',
  'sport.slotsCount': '{count} suất',

  'member.settings': 'Cài đặt nhóm',
  'member.peopleCount': '{count} người',
  'member.peopleEntry': '{count} người trong nhóm',

  'balance.owed': 'Bạn được nhận',
  'balance.owe': 'Bạn cần trả',
  'balance.oweName': 'Bạn cần trả {name}',
  'balance.settled': 'Bạn đã thanh toán xong',
  'balance.tripTotal': 'Tổng chi {total}',
  'balance.received': 'đã nhận {amount}',
  'balance.waitingFor': '{amount} đang chờ {name} xác nhận',

  'invite.button': 'Mời',
  'invite.title': 'Mời bạn bè',
  'invite.cardTitle': 'Mời nhóm của bạn',
  'invite.cardBody': 'Gửi link này vào nhóm chat. Bạn bè chọn tên của mình, không cần tài khoản.',
  'invite.share': 'Chia sẻ',
  'invite.shareText': 'Tham gia nhóm "{trip}" để chia tiền:',

  'share.inviteTitle': 'Tham gia nhóm {trip} trên CoinCrew',
  'share.inviteDescription': 'Chia tiền nhóm, trả nhau bằng VietQR.',
  'share.remindTitle': 'Nhắc thanh toán · {trip}',
  'share.sportTitle': 'Hóa đơn {trip}',
  'share.sportPlanningTitle': 'Lịch buổi chơi {trip}',
  'share.requestDescription': 'Mở để xem số tiền cần trả và trả bằng VietQR.',

  'expenses.emptyTitle': 'Thêm khoản chi đầu tiên',
  'expenses.emptyBody': 'Homestay, ăn uống, xăng xe: mọi thứ cả nhóm dùng chung.',
  'expenses.emptyViewer': 'Chưa có khoản chi nào.',

  'approvals.title': 'Cần duyệt',
  'approvals.allTitle': 'Đang chờ duyệt',
  'approvals.position': '{i}/{n} đang chờ',
  'approvals.previous': 'Trước',
  'approvals.next': 'Tiếp',
  'approvals.seeAll': 'Xem cả {n}',
  'approvals.addedBy': '{name} đã thêm · {amount} · {split}',
  'approvals.differentAmount': 'Nhận được số tiền khác?',
  'approvals.approve': 'Duyệt',
  'approvals.edit': 'Sửa',
  'approvals.reject': 'Từ chối',
  'approvals.rejectReason': 'Lý do từ chối?',
  'approvals.name': '{name} muốn tham gia',
  'approvals.looksLike': 'Có vẻ giống {name}',
  'approvals.sameAs': 'Chính là {name}',
  'approvals.bank': '{name} đã thêm thông tin ngân hàng',
  'approvals.confirm': 'Xác nhận',
  'approvals.didntArrive': 'Chưa nhận được',
  'approvals.amountReceived': 'Số tiền nhận được',
  'approvals.notArrived': '{name} báo chưa nhận được {amount} từ {payer}',
  'approvals.disable': 'Tắt',
  'approvals.keep': 'Giữ lại',
  'approvals.membership': '{name} muốn trở thành thành viên',
  'approvals.proposal': '{by} nói "{guest}" là {into}',
  'proposal.waitingFor': 'Đang chờ {who}',
  'proposal.theAdmin': 'quản trị viên {group}',
  'proposal.and': '{a} và {b}',
  'proposal.cancel': 'Hủy yêu cầu',
  'proposal.cancelled': 'Đã hủy yêu cầu',
  'proposal.declined': 'Yêu cầu gộp {guest} đã bị từ chối',
  'proposal.isThisYou': '{by} nói đây là bạn',
  'proposal.item': '"{guest}" trong {group}',
  'proposal.accept': 'Đồng ý',
  'proposal.decline': 'Từ chối',
  'proposal.acceptAll': 'Đồng ý tất cả',
  'proposal.accepted': 'Đã đồng ý',
  'proposal.alreadySaid': '{by} đã nói đây là bạn',
  'approvals.approveNameFirst': 'Duyệt {name} trước',

  'whoPays.remindCopied': 'Đã sao chép lời nhắc — dán vào nhóm chat nhé.',
  'whoPays.paid': 'Đã trả ✓',

  'transfers.mine': 'Các khoản chuyển của bạn',
  'transfers.all': 'Ai trả ai',
  'transfers.showAll': 'Xem tất cả',
  'transfers.showMine': 'Chỉ của tôi',
  'transfers.addBank': 'Thêm thông tin ngân hàng để có mã QR',
  'transfers.markReceived': 'Đánh dấu đã nhận {amount} từ {name}',
  'transfers.markPaid': 'Đánh dấu đã trả {amount} cho {name}',
  'transfers.received': 'Đã nhận',
  'transfers.paid': 'Tôi đã trả',
  'transfers.receivedSnack': '{name} đã trả {amount}',
  'transfers.paidSnack': 'Bạn đã trả {name} {amount}',
  'transfers.waitingFor': 'Đang chờ {name}',
  'transfers.nothingDue': '{name} hiện không nợ bạn khoản nào.',
  'transfers.alreadySettled': 'Khoản này đã được ghi nhận. Danh sách đã cập nhật.',
  'payments.title': 'Các khoản đã trả',
  'payments.disable': 'Tắt',
  'payments.enable': 'Bật lại',
  'payments.reported': 'Đã báo. Một thành viên sẽ kiểm tra.',
  'payments.notArrivedPill': 'Chưa nhận được',
  'remind.text': 'Chào {name}! Bạn còn {amount} cần trả cho {creditor} trong nhóm "{trip}". Xem chi tiết và chuyển khoản bằng VietQR tại đây nhé: {link}',

  'expenses.disable': 'Tắt',
  'expenses.enable': 'Bật lại',

  'share.groupLink': 'Link nhóm',
  'share.groupHint': 'Gửi vào nhóm chat của bạn. Bạn bè chọn tên của mình — không cần tài khoản.',
  'share.viewLink': 'Link chỉ xem',
  'share.viewHint': 'Ai có link này đều xem được, nhưng không sửa được gì.',
  'share.copy': 'Sao chép',
  'share.copied': 'Đã sao chép',
  'share.imageTitle': 'Lưu ảnh',
  'share.longPress': 'Nhấn giữ ảnh (2 giây) để lưu về máy hoặc chia sẻ thẳng vào nhóm Zalo',
  'share.messageCopied': 'Đã sao chép tin nhắn — dán vào nhóm Zalo',
  'share.copyMessage': 'Sao chép tin nhắn',
  'share.openInBrowser': 'Không lưu được? Nhấn ⋯ → Mở bằng trình duyệt',
  'share.imageFailed': 'Không tạo được ảnh.',
  'share.regenerate': 'Tạo link mới',
  'share.regenerateConfirm': 'Link cũ sẽ không dùng được nữa. Tạo link mới?',

  'settings.title': 'Cài đặt nhóm',
  'settings.people': 'Thành viên',
  'settings.activity': 'Hoạt động',
  'settings.archive': 'Lưu trữ nhóm',
  'settings.archiveConfirm': 'Sẽ không ai thay đổi được nhóm này cho đến khi bạn bỏ lưu trữ. Lưu trữ nhóm?',
  'settings.archived': 'Nhóm này đã được lưu trữ. Bạn vẫn có thể xem.',
  'settings.unarchive': 'Bỏ lưu trữ nhóm',
  'settings.unarchiveHint': 'Mọi người lại có thể thay đổi.',
  'settings.bank': 'Thông tin ngân hàng của bạn',
  'settings.language': 'Ngôn ngữ',
  'settings.dangerZone': 'Vùng nguy hiểm',
  'settings.archiveHint': 'Không ai thay đổi được nhóm đã lưu trữ cho đến khi trưởng nhóm bỏ lưu trữ.',
  'settings.deleteGroup': 'Xóa nhóm', // REVIEW
  'settings.deleteGroupHint': 'Bắt đầu chờ 30 ngày trước khi xóa vĩnh viễn. Bạn có thể hủy bất cứ lúc nào.', // REVIEW
  'settings.deleteSheetTitle': 'Xóa nhóm "{group}"?', // REVIEW
  'settings.deleteWarnBook': 'Các giao dịch trong nhóm này sẽ ngừng tính vào Sổ chi tiêu ngay lập tức.', // REVIEW
  'settings.deleteWarnWait': 'Nhóm sẽ bị xóa vĩnh viễn vào {date}. Bạn có thể hủy bất cứ lúc nào trước ngày này.', // REVIEW
  'settings.deleteWarnPeople': 'Số dư trong mục Mọi người vẫn giữ trong 30 ngày và sẽ mất khi nhóm bị xóa hẳn.', // REVIEW
  'settings.deleteWarnUnsettled': 'Nhóm này vẫn còn khoản chưa thanh toán xong. Các số dư này — cùng các lần thanh toán trước đó trong mục Mọi người — sẽ bị xóa hẳn sau 30 ngày.', // REVIEW
  'settings.deleteConfirm': 'Xóa sau 30 ngày', // REVIEW
  'settings.cancelDelete': 'Hủy xóa nhóm', // REVIEW
  'settings.cancelDeleteShort': 'Hủy xóa', // REVIEW
  'settings.cancelDeleteHint': 'Đưa nhóm về trạng thái đã lưu trữ và khôi phục giao dịch trong Sổ chi tiêu.', // REVIEW
  'settings.cancelDeleteSuccess': 'Đã hủy xóa nhóm. Nhóm đã quay lại trạng thái lưu trữ.', // REVIEW
  'settings.leave': 'Rời nhóm',
  'settings.leaveHint': 'Nhóm sẽ không còn trong danh sách của bạn. Các khoản chi trước đây vẫn được giữ, và bạn có thể vào lại bằng link nhóm.',
  'settings.leaveConfirm': 'Rời {group}?',

  'people.title': 'Thành viên',
  'people.organiser': 'Trưởng nhóm',
  'people.admin': 'Quản trị viên',
  'people.adminBadge': 'Quản trị viên',
  'people.makeAdmin': 'Đặt làm quản trị viên',
  'people.member': 'Thành viên',
  'people.guest': 'Khách',
  'people.merge': 'Gộp',
  'people.mergeInto': 'Gộp {name} vào…',
  'people.mergeConfirm': 'Chuyển toàn bộ khoản chi và thanh toán của {from} sang {into}?',
  'people.likeHint': 'Giống {name}?',
  'people.likeMerge': 'Gộp',
  'people.likeDismiss': 'Không phải cùng một người',
  'people.addFailed': 'Chưa thêm được {names}.',
  'people.mergeExplain': 'Gộp sẽ chuyển mọi khoản chi và thanh toán từ tên này sang tên khác, dùng khi lỡ có tên bị trùng.',
  'people.inviteZalo': 'Mời bạn bè Zalo',
  'people.inviteLinks': 'Link nhóm',
  'people.remove': 'Xóa',
  'people.useMerge': 'Dùng Gộp thay vì xóa',
  'people.removeConfirm': 'Xóa {name} khỏi nhóm? Các khoản chi và thanh toán trước đây vẫn được giữ.',
  'people.cannotRemove': 'Bạn không thể xóa người này.',
  'people.leftTitle': 'Đã rời nhóm',
  'people.leftBadge': 'Đã rời',
  'people.leftOwes': 'Còn nợ {amount}',
  'people.leftOwed': 'Được nhận {amount}',
  'people.leftSettled': 'Đã thanh toán xong',
  'people.restore': 'Thêm lại',

  'activity.title': 'Hoạt động',
  'activity.empty': 'Chưa có hoạt động nào.',
  'activity.loadMore': 'Xem thêm',
  'activity.someone': 'Ai đó',
  'activity.line': '{actor} {action}',
  'activity.today': 'Hôm nay',
  'activity.yesterday': 'Hôm qua',
  'activity.device': 'thiết bị',
  'activity.expenseAdded': '{actor} đã thêm {description} · {amount}',
  'activity.expenseEdited': '{actor} đã sửa {description} · {amount}',
  'activity.expenseApproved': '{actor} đã duyệt {description}',
  'activity.expenseRejected': '{actor} đã từ chối {description}',
  'activity.paymentRecorded': '{from} đã trả {to} {amount}',
  'activity.paymentConfirmed': '{actor} đã xác nhận một khoản thanh toán · {amount}',
  'activity.nameAdded': '{actor} đã thêm {name}',
  'activity.nameApproved': '{actor} đã duyệt {name}',
  'activity.nameMerged': '{actor} đã gộp {from} vào {into}',
  'activity.personRemoved': '{actor} đã xóa {name}',
  'activity.personRestored': '{actor} đã thêm lại {name}',
  'activity.personUnlinked': '{actor} đã tách {name} ra',
  'activity.action.trip_created': 'đã tạo nhóm',
  'activity.action.expense_added': 'đã thêm một khoản chi',
  'activity.action.expense_edited': 'đã sửa một khoản chi',
  'activity.action.expense_deleted': 'đã xóa một khoản chi',
  'activity.action.expense_approved': 'đã duyệt một khoản chi',
  'activity.action.expense_rejected': 'đã từ chối một khoản chi',
  'activity.action.expense_disabled': 'đã tắt một khoản chi',
  'activity.action.expense_enabled': 'đã bật lại một khoản chi',
  'activity.action.name_added': 'đã thêm một tên',
  'activity.action.name_approved': 'đã duyệt một tên mới',
  'activity.action.name_merged': 'đã gộp hai tên',
  'activity.action.person_removed': 'đã xóa một người',
  'activity.action.person_left': 'đã rời nhóm',
  'activity.action.person_restored': 'đã thêm lại một người',
  'activity.action.person_unlinked': 'đã tách một người ra',
  'activity.action.member_joined': 'đã tham gia',
  'activity.action.member_rejoined': 'đã vào lại',
  'activity.action.bank_submitted': 'đã thêm thông tin ngân hàng',
  'activity.action.bank_approved': 'đã duyệt thông tin ngân hàng',
  'activity.action.bank_rejected': 'đã từ chối thông tin ngân hàng',
  'activity.action.payment_recorded': 'đã ghi nhận một khoản thanh toán',
  'activity.action.payment_confirmed': 'đã xác nhận một khoản thanh toán',
  'activity.action.payment_not_arrived': 'báo chưa nhận được tiền',
  'activity.action.payment_disabled': 'đã tắt một khoản thanh toán',
  'activity.action.payment_enabled': 'đã bật lại một khoản thanh toán',
  'activity.action.links_regenerated': 'đã tạo link mới',
  'activity.action.trip_archived': 'đã lưu trữ nhóm',
  'activity.action.trip_unarchived': 'đã bỏ lưu trữ nhóm',
  'activity.action.trip_delete_scheduled': 'đã hẹn xóa nhóm', // REVIEW
  'activity.action.trip_delete_cancelled': 'đã hủy xóa nhóm', // REVIEW
  'activity.action.fewest_changed': 'đã đổi cài đặt Ít lần chuyển khoản nhất',
  'activity.action.round_transfers_changed': 'đã đổi cài đặt làm tròn số tiền chuyển khoản',
  'activity.action.membership_requested': 'đã xin trở thành thành viên',
  'activity.action.membership_approved': 'đã duyệt một thành viên mới',
  'activity.action.membership_rejected': 'đã từ chối một thành viên mới',
  'activity.action.merge_proposed': 'đã đề nghị gộp hai tên',
  'activity.action.merge_proposal_accepted': 'đã đồng ý một yêu cầu gộp tên',
  'activity.action.merge_proposal_declined': 'đã từ chối một yêu cầu gộp tên',

  'pay.title': 'Trả cho {name}',
  'pay.titleGeneric': 'Trả tiền', // REVIEW
  'pay.toLine': 'cho {holder} · {bank}',
  'pay.iPaid': 'Tôi đã trả',
  'pay.iPaidHint': 'Nhấn sau khi bạn đã chuyển tiền xong.',
  'pay.sentTitle': 'Đã chuyển · {amount}',
  'pay.sentBody': 'Đang chờ {name} xác nhận đã nhận tiền. Trang này sẽ tự cập nhật.',
  'pay.mistake': 'Trả nhầm? Nhờ {name} nhấn "Chưa nhận được".',
  'pay.paidTitle': 'Đã trả · {amount} cho {name}',
  'pay.paidBody': 'Đã được tính ngay.',
  'pay.stillOwed': 'Còn thiếu {amount}',
  'pay.showQrRest': 'Hiện mã QR cho phần còn lại',
  'pay.bankAskThem': 'Nhờ họ thêm thông tin ngân hàng, rồi quay lại đây.',
  'pay.scanWithPhone': 'Quét mã QR bằng ứng dụng ngân hàng trên điện thoại của bạn.',
  'pay.account': 'Số tài khoản',
  'pay.covers': 'Gồm những khoản nào',
  'pay.note': 'Nội dung chuyển khoản',
  'pay.copyAccount': 'Sao chép số tài khoản',
  'pay.copyNote': 'Sao chép nội dung',
  'pay.copied': 'Đã sao chép',
  'pay.qrAlt': 'Mã VietQR để trả {name} {amount}',
  'pay.tapToCheck': 'Nhấn để kiểm tra lại',
  'pay.waitingConfirm': 'Đang chờ {name} xác nhận',
  'pay.nothingOwed': 'Hiện tại bạn không nợ {name} khoản nào.',
  'pay.remindThem': 'Nhắc {name}',
  'pay.share': 'Chia sẻ',
  'pay.shareSaved': 'Đã lưu mã QR và sao chép tin nhắn.',
  'pay.shareFailed': 'Không chia sẻ được. Hãy thử Lưu mã QR.',
  'pay.remindBankText': 'Chào {name}! Bạn nhớ thêm thông tin ngân hàng trong nhóm "{trip}" để mình chuyển khoản trả bạn qua VietQR nhé: {link}',
  'pay.savedToGallery': 'Đã lưu mã QR vào thư viện ảnh',
  'pay.handoffTitle': 'Thanh toán bằng {app}',
  'pay.saving': 'Đang lưu mã QR…',
  'pay.savingIos': 'Chọn "Lưu hình ảnh"',
  'pay.savedStep': 'Đã lưu mã QR',
  'pay.saveStep': 'Lưu mã QR',
  'pay.saveAction': 'Lưu',
  'pay.opening': 'Đang mở {app}…',
  'pay.openedStep': 'Đã mở {app}',
  'pay.openStep': 'Mở {app}',
  'pay.openAction': 'Mở',
  'pay.notOpened': 'Không mở được?',
  'pay.openManually': 'Tự mở {app}, rồi chọn Quét QR → tải ảnh lên',
  'pay.zaloAsks': 'Zalo sẽ hỏi: chọn "Tiếp tục"',
  'pay.handoffTip': 'Trong {app}: Quét QR → tải ảnh lên → chọn mã QR vừa lưu.',

  'expensePay.title': 'Trả cho {name}',
  'expensePay.rowLabel': 'Phần của {name}',
  'expensePay.allPaid': 'Đã trả đủ ✓',
  'expensePay.friendOf': 'Bạn của {name}',
  'expensePay.nameOrFriend': '{name} (hoặc bạn của {name})',
  'expensePay.paidLine': '{who} đã trả {amount}',
  'expensePay.notReceived': '{payer} chưa nhận được {amount}',
  'expensePay.viewBill': 'Xem bill',
  'expensePay.billTitle': 'Bill',
  'expensePay.nothingHere': 'Bill này không có phần nào của {name}',

  'owe.title': '{name} ơi, bạn cần trả',
  'owe.pay': 'Trả cho {name}',
  'owe.allSet': 'Bạn đã trả xong hết',
  'owe.allSetBody': 'Bạn không nợ ai trong {trip}.',
  'owe.waiting': 'Đang chờ {name} xác nhận',
  'owe.seeGroup': 'Xem nhóm',
  'owe.signInToSee': 'Đăng nhập để xem nhóm',
  'owe.joinToSee': 'Tham gia để xem cả nhóm',
  'owe.joinGroup': 'Tham gia nhóm',
  'owe.logIn': 'Đăng nhập',

  'bankFirst.title': 'Thêm thông tin ngân hàng trước?',
  'bankFirst.body': 'Bạn bè mở link này chỉ thấy mã QR để trả bạn khi bạn đã thêm thông tin ngân hàng.',
  'bankFirst.add': 'Thêm thông tin ngân hàng',
  'bankFirst.anyway': 'Vẫn chia sẻ',

  'whoPaid.title': 'Bạn trả phần của ai?',
  'whoPaid.wholeRow': 'Cả phần của {name} · {amount}',
  'whoPaid.mySlot': 'Chỉ phần của tôi · {amount}',
  'whoPaid.other': 'Số khác',
  'whoPaid.otherConfirm': 'Đã trả {amount}',
  'whoPaid.tooMuch': 'Tối đa {amount}',

  'bankForm.title': 'Thông tin ngân hàng của bạn',
  'bankForm.guestNote': 'Một thành viên sẽ duyệt thông tin ngân hàng mới trước khi người khác có thể chuyển khoản cho bạn.',
  'bankForm.memberNote': 'Đã lưu vào hồ sơ của bạn và dùng cho tất cả các nhóm.',
  'bankForm.save': 'Lưu thông tin ngân hàng',
  'bankForm.saved': 'Đã lưu',
  'bankForm.pending': 'Đang chờ một thành viên duyệt thông tin ngân hàng của bạn.',
  'bankForm.consentLabel': 'Tôi đồng ý với {link}',
  'bankForm.privacyLink': 'thông báo quyền riêng tư',
  'bankForm.addPrompt': 'Thêm thông tin ngân hàng để bạn bè có thể chuyển khoản trả bạn qua VietQR.',

  'rows.swipeHint': 'Vuốt sang trái hoặc nhấn vào dòng để xem thêm tùy chọn',

  'details.expense': 'Khoản chi',
  'details.payment': 'Khoản thanh toán',
  'details.date': 'Ngày',
  'details.paidBy': 'Người trả',
  'details.addedBy': 'Người thêm',
  'details.split': 'Cách chia',
  'details.you': '{name} (bạn)',
  'details.amountClaimed': 'Số tiền đã chuyển',
  'details.amountConfirmed': 'Số tiền đã nhận',
  'details.recorded': 'Ghi lúc',
  'details.gone': 'Mục này không còn trong nhóm.',
  'details.backToTrip': 'Về nhóm',
  'status.approved': 'Đã duyệt',
  'who.guestLine': 'Bạn đang vào với tư cách khách: những gì bạn thêm cần thành viên duyệt.',
  'signIn.zalo': 'Đăng nhập bằng Zalo',
  'signIn.googleInZalo': 'Đã dùng Google trước đây? Nhấn ⋯ → Mở bằng trình duyệt để đăng nhập Google, rồi liên kết Zalo trong menu tài khoản.',
  'signIn.zaloContinue': 'Tiếp tục với tài khoản Zalo',
  'signIn.zaloDeclined': 'Cần tên và ảnh Zalo của bạn để tạo tài khoản.',
  'signIn.zaloGoogleWarning': 'Bạn đã dùng CoinCrew bằng Google? Hãy liên kết Zalo trên bản web trước.',
  'guest.becomeMemberZalo': 'Đăng nhập bằng Zalo để trở thành thành viên',
  'who.guestSignInZalo': 'Đăng nhập bằng Zalo để dùng đầy đủ tính năng',
  'who.nameMatch': 'Đây là bạn phải không, {name}? Đã chọn sẵn theo tên tài khoản của bạn.',
  'who.zaloMatch': 'Bạn là {name} phải không?',
  'who.zaloMatchContinue': 'Tiếp tục với tên {name}',
  'who.signInTitle': 'Đăng nhập',
  'who.guestSignIn': 'Đăng nhập bằng Google để dùng đầy đủ tính năng',
  'myBank.title': 'Thông tin ngân hàng của bạn',
  'myBank.none': 'Chưa có thông tin ngân hàng',
  'myBank.add': 'Thêm',
  'myBank.pending': 'Đang chờ thành viên duyệt',
  'myBank.change': 'Đổi',
  'myBank.locked': 'Chỉ thành viên mới đổi được',
  'myBank.namePending': 'Bạn có thể thêm sau khi thành viên duyệt tên của bạn.',
  'guestBank.title': 'Thông tin ngân hàng của {name}',
  'guestBank.pending': 'Đang chờ thành viên duyệt.',
  'guestBank.note': 'Thông tin bạn lưu được dùng ngay. Chỉ nhập thông tin do {name} đưa cho bạn.',
  'guestBank.consent': '{name} đã đồng ý chia sẻ thông tin này. Xem {link}',
  'guestBank.change': 'Đổi',
  'guestBank.delete': 'Xóa',
  'guestBank.deleteConfirm': 'Xóa thông tin ngân hàng của {name}? Sẽ không ai chuyển tiền cho {name} bằng mã QR được cho đến khi có thông tin mới.',
  'guestBank.deleted': 'Đã xóa',
  'people.bank': 'Thông tin ngân hàng',
  'people.bankNone': 'Chưa có thông tin ngân hàng',
  'people.bankPending': 'Thông tin ngân hàng đang chờ duyệt',
  'people.bankWaitingSuffix': 'đang chờ duyệt',
  'transfers.addFor': 'Thêm thông tin ngân hàng cho {name}',
  'activity.bankSet': '{actor} đã lưu thông tin ngân hàng của {name}',
  'activity.bankRemoved': '{actor} đã xóa thông tin ngân hàng của {name}',
  'activity.action.bank_set': 'đã lưu thông tin ngân hàng',
  'activity.action.bank_removed': 'đã xóa thông tin ngân hàng',
  'payments.mine': 'Các khoản đã trả của bạn',
  'payments.all': 'Tất cả khoản đã trả',
  'payments.helper': 'Các khoản này dùng để thanh toán nợ giữa thành viên, không cộng thêm vào tổng chi tiêu của nhóm.', // REVIEW
  'payments.emptyMine': 'Chưa có khoản thanh toán nào liên quan đến bạn.',
  'payments.throughPeople': 'Đã tính vào tổng ở mục Mọi người',
  'payments.arrived': 'Đã nhận được',
  'expenses.mine': 'Khoản chi của bạn',
  'expenses.all': 'Tất cả khoản chi',
  'expenses.emptyMine': 'Chưa có khoản chi nào liên quan đến bạn.',
  'expense.youPaidTotal': 'Bạn đã trả {amount}',
  'expense.personPaidTotal': '{name} đã trả {amount}',
  'activity.paymentArrived': '{actor} báo đã nhận được một khoản thanh toán · {amount}',
  'activity.action.payment_arrived': 'báo đã nhận được một khoản thanh toán',
  'activity.adminPromoted': '{actor} đã đặt {name} làm quản trị viên nhóm',
  'activity.adminDemoted': '{actor} đã gỡ quyền quản trị viên của {name}',
  'activity.action.admin_promoted': 'đã đặt một quản trị viên nhóm',
  'activity.action.admin_demoted': 'đã gỡ một quản trị viên nhóm',
  'activity.expenseRolledBack': '{actor} đã khôi phục "{description}"',
  'activity.action.expense_rolled_back': 'đã khôi phục một khoản chi',
  'people.removeAdmin': 'Gỡ quyền quản trị viên',

  'updates.bannerTitle': 'Một số giao dịch liên quan đến bạn vừa được cập nhật',
  'updates.viewAll': 'Xem các giao dịch đã cập nhật',
  'updates.previous': 'Trước đó',
  'updates.now': 'Hiện tại',
  'updates.dismiss': 'Đã hiểu',
  'auth.failed': 'Chưa đăng nhập được — hãy thử lại',
  'auth.linked': 'Đã liên kết {provider}',
  'auth.mergeRequested': 'Tài khoản {provider} này đã gắn với một tài khoản CoinCrew khác. Đăng nhập vào tài khoản đó để xác nhận gộp (hết hạn sau 7 ngày).',
  'account.zaloAccount': 'Tài khoản Zalo',
  'error.lastIdentity': 'Hãy liên kết thêm một cách đăng nhập khác trước.',
  'error.mergeStale': 'Yêu cầu gộp này không còn hiệu lực.',
  'account.methods': 'Cách đăng nhập',
  'account.methodsHint': 'Quản lý các tài khoản bạn dùng để đăng nhập',
  'account.whyLink': 'Vì sao nên liên kết?',
  'account.notLinked': 'Chưa liên kết',
  'account.linked': 'Đã liên kết',
  'account.link': 'Liên kết',
  'account.change': 'Đổi',
  'account.unlink': 'Gỡ liên kết',
  'account.unlinkConfirm': 'Gỡ liên kết {provider}? Bạn sẽ đăng nhập bằng cách còn lại.',
  'account.backupNudgeZalo': 'Liên kết thêm Google để không mất tài khoản này nếu tài khoản Zalo của bạn thay đổi',
  'account.backupNudgeGoogle': 'Liên kết thêm Zalo để đăng nhập ngay trong ứng dụng Zalo',
  'account.manageOnWeb': 'Liên kết Google hoặc cách đăng nhập khác trên bản web:',
  'merge.cancel': 'Hủy',
  'merge.chipPending': 'Chờ xác nhận',
  'merge.chipDeclined': 'Bị từ chối',
  'merge.chipAccepted': 'Đã gộp',
  'merge.rowLabel': '{provider}: {status}, {name}. Xem chi tiết',
  'merge.incoming': '{name} ({who}) muốn gộp tài khoản này vào tài khoản của họ',
  'merge.review': 'Xem & gộp',
  'merge.decline': 'Từ chối',
  'merge.moves': '{groups} nhóm, thông tin ngân hàng và lịch sử của bạn sẽ chuyển sang tài khoản của {name}.',
  'merge.released': '{provider} {email} sẽ không đăng nhập vào tài khoản này được nữa',
  'merge.dot': 'Có yêu cầu gộp tài khoản đang chờ',
  'merge.sheetTitle': 'Gộp với tài khoản {name}',
  'merge.sheetIntro': '{provider} này đã thuộc về tài khoản CoinCrew {name}. Khi gộp, các nhóm, thông tin ngân hàng và lịch sử của {name} sẽ chuyển sang tài khoản này.',
  'merge.step1': 'Bạn đã xác minh {provider} {label}',
  'merge.step2Pending': 'Xác nhận từ tài khoản {name}',
  'merge.step2Help': 'Đăng nhập bằng {provider} đó rồi nhấn "Xem & gộp". Hết hạn {date}.',
  'merge.step2Declined': '{name} đã từ chối gộp',
  'merge.step2Accepted': '{name} đã đồng ý',
  'merge.step3': 'Hai tài khoản gộp thành một',
  'merge.declinedHelp': 'Bạn có thể liên kết {provider} khác, hoặc thử lại nếu {name} đổi ý.',
  'merge.acceptedSummary': 'Các nhóm, thông tin ngân hàng và lịch sử của {name} đã chuyển sang tài khoản này.',
  'merge.confirmHere': 'Đăng nhập bằng {provider} để xác nhận',
  'merge.switchNote': 'Thiết bị này sẽ chuyển sang tài khoản {name}. Sau khi gộp, bạn quay lại tài khoản này với đầy đủ dữ liệu của cả hai.',
  'merge.cancelRequest': 'Hủy yêu cầu',
  'merge.linkAgain': 'Liên kết lại',
  'merge.gotIt': 'Đã hiểu',
  'merge.noRequestHere': 'Tài khoản này không có yêu cầu gộp nào đang chờ.',
  'merge.pickTitle': 'Gộp {name} với…',
  'merge.searchPlaceholder': 'Tìm tên, email hoặc nhóm',
  'merge.suggested': 'Có vẻ giống {name}',
  'merge.everyone': 'Những người khác',
  'merge.noResults': 'Không có ai khớp',
  'merge.tagOnlyYou': 'Chỉ mình bạn thấy',
  'merge.tagGroup': 'Gộp trong {group} cho mọi người',
  'merge.tagAskAdmin': 'Cần quản trị viên {group} đồng ý',
  'merge.tagAskUser': 'Cần {name} và quản trị viên {group} đồng ý',
  'merge.tagAskUserOnly': 'Cần {name} đồng ý',
  'merge.tagClaimPending': '{name} đã xin nhận tên này. Đang chờ quản trị viên {group}.',
  'merge.tagBusy': 'Đã có yêu cầu đang chờ trong {group}',
  'merge.pickConfirmTitle': 'Gộp {a} và {b}?',
  'merge.confirmTitle': 'Gộp tài khoản?',
  'merge.stepLink': 'Chỉ mình bạn: bạn sẽ thấy họ là một người. Các nhóm không thay đổi.',
  'merge.stepMerge': '{b} được gộp vào {a} trong {group}. Mọi người trong {group} sẽ thấy một người tên {a}.',
  'merge.stepAskAdmin': 'Quản trị viên {group} sẽ được hỏi để gộp.',
  'merge.stepAskUser': '{name} và quản trị viên {group} sẽ được hỏi ý kiến.',
  'merge.stepAskUserOnly': '{name} sẽ được hỏi ý kiến.',
  'merge.pickConfirm': 'Xác nhận',
  'merge.confirm': 'Gộp tài khoản',
  'merge.back': 'Quay lại',
  'merge.sent': 'Đã gửi yêu cầu',
  'entry.tabs': 'Bạn đang thêm gì?',
  'entry.expense': 'Khoản chi',
  'entry.income': 'Thu quỹ',
  'fund.title': 'Quỹ nhóm',
  'fund.pillLabel': 'Quỹ nhóm, {amount}',
  'fund.addTitle': 'Thêm vào quỹ',
  'fund.editTitle': 'Sửa khoản thu quỹ',
  'fund.add': 'Thêm vào quỹ',
  'fund.note': 'Ghi chú',
  'fund.notePlaceholder': 'VD: Thu 2 khách vãng lai',
  'fund.keepAtLeast': 'Phải giữ ít nhất {amount}: phần còn lại đã được chi.',
  'fund.payerOption': 'Quỹ nhóm · {amount}',
  'fund.paidTitle': 'Chi từ quỹ nhóm',
  'fund.noShares': 'Không ai phải góp.',
  'fund.after': 'Quỹ còn lại sau khoản này: {amount}',
  'fund.overLimit': 'Quỹ chỉ còn {amount}. Hãy giảm số tiền hoặc chọn người trả khác.',
  'fund.rowIncome': 'Thu quỹ · {name} thêm',
  'fund.rowIncomeMe': 'Thu quỹ · bạn thêm',
  'fund.rowPaid': 'Chi từ quỹ nhóm',
  'fund.added': 'Đã thu',
  'fund.spent': 'Đã chi',
  'fund.keptBy': 'Quản trị viên giữ',
  'fund.adminsOnly': 'Chỉ quản trị viên mới được thêm hoặc chi tiền quỹ.',
  'fund.emptyTitle': 'Quỹ đang trống.',
  'fund.emptyBody': 'Tiền khách vãng lai góp hoặc tiền tài trợ sẽ hiện ở đây.',
  'fund.addedBy': 'Người thêm',
  'fund.readOnly': 'Chỉ quản trị viên mới được sửa khoản thu quỹ.',
  'fund.cantDisable': 'Không thể tắt: {amount} trong khoản này đã được chi.',
  'fund.expenseNote': 'Không ai phải góp. Tiền được chi từ quỹ nhóm.',
  'details.income': 'Khoản thu quỹ',
  'error.fundShort': 'Quỹ nhóm không đủ cho khoản này. Kiểm tra quỹ rồi thử lại.',
  'activity.incomeAdded': '{actor} đã thêm {amount} vào quỹ · {description}',
  'activity.incomeEdited': '{actor} đã sửa khoản thu quỹ · {description} · {amount}',
  'activity.incomeDisabled': '{actor} đã tắt khoản thu quỹ · {description}',
  'activity.incomeEnabled': '{actor} đã bật lại khoản thu quỹ · {description}',
  'activity.incomeRolledBack': '{actor} đã khôi phục khoản thu quỹ · {description}',
  'activity.fundExpenseAdded': '{actor} đã chi {amount} từ quỹ · {description}',
  'activity.action.income_added': 'đã thêm tiền vào quỹ',
  'activity.action.income_edited': 'đã sửa một khoản thu quỹ',
  'activity.action.income_disabled': 'đã tắt một khoản thu quỹ',
  'activity.action.income_enabled': 'đã bật lại một khoản thu quỹ',
  'activity.action.income_rolled_back': 'đã khôi phục một khoản thu quỹ',
  'activity.ratingsEnabled': '{actor} đã bật đánh giá người chơi',
  'activity.ratingsDisabled': '{actor} đã tắt đánh giá người chơi',
  'activity.action.ratings_changed': 'đã đổi cài đặt đánh giá người chơi',
  'activity.action.theme_changed': 'đã đổi màu của nhóm',
  'error.ratingLimit': 'Bạn đã dùng hết sao. Hãy thu hồi một sao rồi thử lại.',
  'ratings.title': 'Đánh giá người chơi',
  'ratings.leaderboard': 'Bảng xếp hạng',
  'ratings.quote': 'Đánh hết mình, chấm công tâm — mỗi sao đều quý',
  'ratings.rateAction': 'Chấm sao',
  'ratings.coldTitle': 'Chưa có đánh giá nào',
  'ratings.coldBody': 'Hãy là người đầu tiên chấm sao ẩn danh cho đồng đội để lập bảng xếp hạng của CLB.',
  'ratings.coldCta': 'Nhấn vào đây để chấm sao đồng đội',
  'ratings.budgetTitle': 'Ví sao của bạn',
  'ratings.budgetLeft': 'Còn {remaining} / {max} ★',
  'ratings.budgetHint': 'Ẩn danh 100% · Nhấn ★ để tặng (tối đa {maxPerPlayer}★) · Giữ ★ để biến thành mặt trời và nổ về 0',
  'ratings.overBudgetTitle': 'Vượt số sao vì nhóm bớt người',
  'ratings.overBudgetHint': 'Bạn đã tặng {spent} ★ (giới hạn mới: {max} ★). Hãy thu hồi ít nhất {over} ★ trước khi tặng thêm.',
  'ratings.totalStars': 'Tổng {count} ★',
  'ratings.yours': 'Bạn tặng: {count}/{max} ★',
  'ratings.youBadge': 'Bạn',
  'ratings.giveStar': 'Tặng 1 sao cho {name}',
  'ratings.takeStar': 'Thu hồi 1 sao từ {name}',
  'ratings.searchPlaceholder': 'Tìm trong {count} người chơi…',
  'ratings.searchLabel': 'Tìm người chơi',
  'ratings.noSearchMatch': 'Không tìm thấy người chơi "{query}".',
  'ratings.showAll': 'Hiện tất cả {count} người chơi',
  'ratings.guestTitle': 'Đăng nhập để chấm sao',
  'ratings.guestBody': 'Chỉ thành viên đã đăng nhập mới có ví sao để chấm điểm ẩn danh.',
  'ratings.switchTitle': 'Đánh giá người chơi',
  'ratings.switchExplain': 'Cho phép thành viên đã đăng nhập tặng sao ẩn danh để đánh giá người chơi và hiện bảng xếp hạng CLB.',
  'ratings.collapse': 'Thu gọn bảng xếp hạng',
  'ratings.expand': 'Mở rộng bảng xếp hạng',
  'ratings.leaderboardBar': 'Tóm tắt bảng xếp hạng',

  'nav.home': 'Khoản chi nhanh',
  'nav.book': 'Sổ chi tiêu', // REVIEW
  'nav.groups': 'Nhóm',
  'nav.activity': 'Hoạt động',
  'nav.add': 'Thêm giao dịch',
  'nav.label': 'Menu chính',

  'feedback.menu': 'Gửi góp ý',
  'feedback.title': 'Gửi góp ý',
  'feedback.hint': 'Ẩn danh — chúng mình không biết bạn là ai.',
  'feedback.bug': 'Lỗi',
  'feedback.idea': 'Ý tưởng',
  'feedback.other': 'Khác',
  'feedback.placeholder': 'Có gì chưa ổn, hay điều gì giúp CoinCrew tốt hơn?',
  'feedback.contactMe': 'Có thể liên hệ với tôi về việc này (sẽ chia sẻ tên của bạn)',
  'feedback.contactField': 'Tên hoặc Zalo của bạn',
  'feedback.send': 'Gửi',
  'feedback.thanks': 'Cảm ơn bạn — chúng mình đọc mọi góp ý.',
  'feedback.error': 'Chưa gửi được. Vui lòng thử lại.',
  'feedback.rateLimited': 'Bạn vừa gửi nhiều quá — thử lại sau nhé.',

  'epa.reported': '{n} người báo đã trả',
  'epa.progress': '{got}/{total} đã nhận',
  'epa.notReported': 'còn {n} người chưa trả',
  'epa.confirmAll': 'Đã nhận tất cả · {sum}',
  'epa.confirmed': 'Đã xác nhận {name} · {amount}',
  'epa.undo': 'Hoàn tác',
  'epa.received': 'Đã nhận {amount}',
  'epa.other': 'Số khác',
  'epa.notReceived': 'Chưa nhận được',
  'epa.friendOf': 'Bạn của {name}',
  'epa.nameOrFriend': '{name} (hoặc bạn của {name})',

  'claim.title': 'Tiếp tục với tên {name}',
  'claim.body': 'Không đăng nhập Google được trong Zalo. Hãy đăng nhập bằng Zalo để tiếp tục. Nếu {name} dùng Google, tài khoản Google của {name} sẽ được hỏi để duyệt.',
  'claim.zalo': 'Đăng nhập bằng Zalo',
  'claim.openBrowser': 'Mở bằng trình duyệt',
  'claim.browserSteps': 'Nhấn ⋯ → Mở bằng trình duyệt',
  'claim.zaloOff': 'Hiện chưa đăng nhập bằng Zalo được. Mở bằng trình duyệt để dùng Google.',
  'claim.waiting': 'Đang chờ {name} duyệt trên trình duyệt',
  'claim.nothingToPay': '{name} không cần trả gì cho khoản chi này.',
  'claim.taken': '{name} đã đăng nhập bằng một tài khoản Zalo khác',
  'claim.waitingWho': 'Bạn đã xin liên kết với tài khoản của {name}. Đang chờ duyệt trên trình duyệt.',
  'claim.paymentFlag': 'Do tài khoản Zalo đang chờ liên kết với {name} đánh dấu',

  'join.banner': 'Tài khoản Zalo ({name}) muốn liên kết với tài khoản của bạn',
  'join.title': 'Yêu cầu liên kết',
  'join.body': 'Tài khoản Zalo này sẽ thành một cách đăng nhập vào tài khoản của bạn.',
  'join.groupsMove': 'Các nhóm này sẽ chuyển sang tài khoản của bạn:',
  'join.collapse': 'Trong {group}, {zaloPersonName} và {yourPersonName} sẽ trở thành một người',
  'join.autoConfirm': 'Các khoản mà tài khoản này đã đánh dấu sẽ được tính là đã trả:',
  'join.autoConfirmRow': '{amount} cho {to} · {group}',
  'join.accept': 'Đồng ý',
  'join.decline': 'Từ chối',
  'join.accepted': 'Đã liên kết tài khoản Zalo',

  'theme.title': 'Màu giao diện',
  'theme.personalExplain': 'Màu của bạn ở mọi nơi ngoài nhóm. Trong nhóm, màu do quản trị viên chọn sẽ được ưu tiên.',
  'theme.groupTitle': 'Màu của nhóm',
  'theme.groupExplain': 'Mọi người trong nhóm, kể cả khách, đều thấy màu này.',
  'theme.useOwn': 'Theo màu riêng của mỗi người',
  'theme.useOwnShort': 'Theo từng người',
  'theme.name.jade': 'Ngọc bích',
  'theme.name.pink': 'Hồng',
  'theme.name.orchid': 'Lan tím',
  'theme.name.sky': 'Xanh trời',
  'theme.name.indigo': 'Chàm',

  'notifications.title': 'Thông báo', // REVIEW
  'notifications.emailSection': 'Qua email', // REVIEW
  'notifications.transactionCrud': 'Thay đổi giao dịch',
  'notifications.transactionCrudDesc': 'Nhận email khi có giao dịch được tạo, sửa hoặc xóa trong nhóm',
  'notifications.loanReminders': 'Nhắc khoản nợ & số dư',
  'notifications.loanRemindersDesc': 'Email nhắc định kỳ về các khoản nợ chưa trả',
  'notifications.monthlyNotice': 'Tổng kết hằng tháng',
  'notifications.monthlyNoticeDesc': 'Tổng kết chi tiêu và số dư của các nhóm khi hết tháng',
  'notifications.noEmailWarning': 'Bạn chưa liên kết email. Hãy liên kết tài khoản Google để nhận thông báo qua email.',

  'push.sectionLabel': 'Trên điện thoại này', // REVIEW
  'push.sectionHint': 'Chỉ áp dụng cho điện thoại này.', // REVIEW
  'push.unsupported': 'Trình duyệt này không gửi được thông báo. Mở CoinCrew bằng Chrome hoặc Safari để bật.', // REVIEW
  'push.iosInstallTitle': 'Thêm vào màn hình chính trước', // REVIEW
  'push.iosInstallDesc': 'iPhone chỉ gửi thông báo khi mở CoinCrew từ màn hình chính', // REVIEW
  'push.enableTitle': 'Bật thông báo trên điện thoại này', // REVIEW
  'push.enableDesc': 'Buổi chơi, lời nhắc và khoản chi có bạn', // REVIEW
  'push.enableButton': 'Bật thông báo', // REVIEW
  'push.blockedTitle': 'Điện thoại đang chặn thông báo của CoinCrew', // REVIEW
  'push.blockedStep1': 'Mở Cài đặt của điện thoại', // REVIEW
  'push.blockedStep2': 'Chọn Thông báo → CoinCrew', // REVIEW
  'push.blockedStep3': 'Bật Cho phép thông báo, rồi quay lại đây', // REVIEW
  'push.newSession': 'Buổi chơi mới có tên bạn', // REVIEW
  'push.newSessionDesc': 'Khi admin thêm bạn vào buổi chơi', // REVIEW
  'push.reminder': 'Nhắc trước buổi chơi', // REVIEW
  'push.reminderDesc': '{lead} trước giờ bắt đầu', // REVIEW
  'push.leadLabel': 'Nhắc trước bao lâu', // REVIEW
  'push.lead15': '15 phút', // REVIEW
  'push.lead30': '30 phút', // REVIEW
  'push.lead60': '1 giờ', // REVIEW
  'push.lead120': '2 giờ', // REVIEW
  'push.expense': 'Thay đổi giao dịch', // REVIEW
  'push.expenseDesc': 'Khoản chi mới tính phần của bạn', // REVIEW
  'push.pill': 'Nhận thông báo trên điện thoại', // REVIEW
  'push.askTitle': 'Nhận thông báo trên điện thoại', // REVIEW
  'push.askNewSessionDesc': 'Khi admin lên lịch buổi chơi và thêm bạn vào danh sách', // REVIEW
  'push.askExpenseDesc': 'Khi có khoản chi mới tính phần của bạn', // REVIEW
  'push.notNow': 'Để sau', // REVIEW
  'push.enabled': 'Đã bật thông báo', // REVIEW

  'install.title': 'Thêm CoinCrew vào màn hình chính',
  'install.pill': 'Thêm CoinCrew vào màn hình chính',
  'install.menuRow': 'Thêm vào màn hình chính',
  'install.promptBody': 'Mở chỉ với một chạm, toàn màn hình, không có thanh trình duyệt.',
  'install.installNow': 'Cài ngay',
  'install.notNow': 'Để sau',
  'install.gotIt': 'Đã hiểu',
  'install.installed': 'Đã thêm vào màn hình chính',
  'install.androidStep1': 'Nhấn ⋮ ở góc trên trình duyệt',
  'install.androidStep2': 'Chọn "Thêm vào màn hình chính" hoặc "Cài đặt ứng dụng"',
  'install.iosStepMore': 'Nhấn ⋯ trên thanh Safari',
  'install.iosStepShare': 'Chọn Chia sẻ',
  'install.iosStepShareOld': 'Nhấn Chia sẻ ở thanh dưới',
  'install.iosStepAdd': 'Kéo xuống, chọn "Thêm vào MH chính"',
  'install.iosChromeStep1': 'Nhấn Chia sẻ trên thanh địa chỉ',
  'install.iosChromeStep2': 'Chọn "Thêm vào MH chính"',
  'install.iosOtherStep': 'Mở menu của trình duyệt, chọn Chia sẻ → "Thêm vào MH chính"',
  'install.iosSignInNote': 'Lần đầu mở từ màn hình chính, bạn cần đăng nhập lại một lần.',
  'install.inAppTitle': 'Mở bằng trình duyệt để cài',
  'install.inAppZalo': 'Không thể cài CoinCrew từ trong Zalo.',
  'install.inAppOther': 'Không thể cài CoinCrew từ trong ứng dụng này.',
  'install.inAppStep1': 'Nhấn ⋯ ở góc trên',
  'install.inAppStep2': 'Chọn "Mở bằng trình duyệt", rồi nhấn lại "Thêm vào màn hình chính"',
  'install.copyLink': 'Sao chép link',
  'install.desktopStep': 'Nhấn biểu tượng cài đặt trên thanh địa chỉ',

  // Yêu cầu thanh toán của nhóm và chia sẻ hóa đơn một khoản chi (issue #93).
  'request.button': 'Yêu cầu thanh toán',
  'request.copied': 'Đã sao chép tin nhắn. Dán vào tin nhắn hoặc nhóm chat nhé.',
  'request.textHead': 'Nhóm "{trip}", cần chuyển cho {creditor}:',
  'request.textFoot': 'Chọn tên mình để xem mã QR: {link}',
  'request.cardTitle': '{trip} · Yêu cầu thanh toán',
  'request.cardMeta': '{date} · Nhận: {name}',
  'request.cardAmount': 'CẦN CHUYỂN',
  'request.cardTotal': 'TỔNG',
  'request.cardHint': 'Mở link để có mã QR đúng số tiền của bạn',
  'card.name': 'TÊN',
  'bill.button': 'Chia sẻ hóa đơn & mã QR',
  'bill.cardMeta': '{date} · {trip} · Trả trước: {name}',
  'bill.cardAmount': 'PHẦN CHIA',
  'bill.cardTotal': 'TỔNG HÓA ĐƠN',
  'bill.payerTag': '(người trả)',
  'bill.hintEqual': 'Quét mã để chuyển {amount}',
  'bill.hintUneven': 'Mở link để có mã QR đúng phần của bạn',
  'bill.textEqual': '{description}: {total}, mỗi người {amount}.',
  'bill.textUneven': '{description}: {total}. {list}.',
  'bill.textFoot': 'Mã QR & chi tiết: {link}',
  'share.requestTitle': 'Yêu cầu thanh toán · {trip}',
  'share.billTitle': 'Hóa đơn · {trip}',
  'share.pcHint': 'Nhấp chuột phải vào ảnh để sao chép hoặc lưu, rồi dán vào tin nhắn hoặc nhóm chat.',
  'turnout.title': 'Khả năng đến thật', // REVIEW
  'turnout.estimate': 'khoảng {likely}/{total}', // REVIEW
  'turnout.counts': '{sure} chắc đến · {unsure} chưa chắc · {flaky} hay bùng', // REVIEW
  'turnout.seeWho': 'Xem ai ›', // REVIEW
  'turnout.back': 'Đã trở lại!', // REVIEW
  'turnout.presence': 'Hay đến', // REVIEW
  'turnout.reliability': 'Giữ lời', // REVIEW
  'turnout.guest': 'Dắt khách', // REVIEW
  'attendance.label.new': 'Mới', // REVIEW
  'attendance.label.regular': 'Hay đến', // REVIEW
  'attendance.label.rare': 'Ít đến', // REVIEW
  'attendance.label.flaky': 'Hay bùng', // REVIEW
  'attendance.label.topGuest': 'Dắt nhiều khách', // REVIEW
  'attendance.label.back': 'Trở lại', // REVIEW
  'awards.title': 'Giải thưởng sân cầu', // REVIEW
  'awards.entry': 'Giải thưởng sân cầu', // REVIEW
  'awards.empty': 'Chưa có buổi tập nào được tính điểm. Hoàn tất một buổi tập để mở bảng trao giải.', // REVIEW
  'awards.replay': 'Xem lại', // REVIEW
  'awards.save': 'Lưu ảnh', // REVIEW
  'awards.share': 'Chia sẻ', // REVIEW
  'awards.saved': 'Đã lưu ảnh', // REVIEW
  'awards.saveFailed': 'Chưa lưu được ảnh. Hãy thử lại.', // REVIEW
  'awards.shareFailed': 'Chưa chia sẻ được ảnh. Hãy thử lại.', // REVIEW
  'awards.footer': 'CoinCrew · Tiền Đâu', // REVIEW
  'awards.heading': 'Lễ trao giải chuyên cần', // REVIEW
  'awards.subheading': 'ĐỘI CẦU CỦA CHÚNG TA', // REVIEW
  'awards.subheadingDate': 'BUỔI TẬP · {date}', // REVIEW
  'awards.title.regular': 'Vua chuyên cần', // REVIEW
  'awards.title.back': 'Sự trở lại ngoạn mục', // REVIEW
  'awards.title.guest': 'Đại sứ kéo khách', // REVIEW
  'awards.title.noShow': 'Thánh bùng kèo', // REVIEW
  'awards.stat.regular': '{n} trận liền, chưa vắng buổi nào', // REVIEW
  'awards.stat.regular_one': '{n} trận liền, chưa vắng buổi nào', // REVIEW
  'awards.stat.regularPlayed': '{n} buổi đã chơi', // REVIEW
  'awards.stat.regularPlayed_one': '{n} buổi đã chơi', // REVIEW
  'awards.stat.back': 'Vắng {n} buổi, nay đã về sân', // REVIEW
  'awards.stat.back_one': 'Vắng {n} buổi, nay đã về sân', // REVIEW
  'awards.stat.guest': 'Dẫn {n} khách ra sân', // REVIEW
  'awards.stat.guest_one': 'Dẫn {n} khách ra sân', // REVIEW
  'awards.stat.noShow': 'Bùng kèo {n} trận liên tiếp', // REVIEW
  'awards.stat.noShow_one': 'Bùng kèo {n} trận', // REVIEW
  'awards.wanted.heading': 'TRUY NÃ', // REVIEW
  'awards.wanted.crime': 'Tội danh: bùng kèo {n} trận liên tiếp', // REVIEW
  'awards.wanted.crime_one': 'Tội danh: bùng kèo {n} trận', // REVIEW
  'awards.wanted.lastSeen': 'Lần cuối thấy ra sân: {date}', // REVIEW
  'awards.wanted.neverSeen': 'Lần cuối thấy ra sân: chưa rõ', // REVIEW
  'awards.wanted.reward': 'TIỀN THƯỞNG: 1 QUẢ CẦU', // REVIEW
  'awards.wanted.stamp': 'ĐÃ RA SÂN!', // REVIEW
  'awards.verse.heading': 'Ca dao sân cầu', // REVIEW
  'awards.verse.month': 'mùa giải này', // REVIEW
  'awards.verse.seal': 'Tiền Đâu', // REVIEW
  'awards.verse.tag.regular': 'vua chuyên cần', // REVIEW
  'awards.verse.tag.back': 'người cũ trở về', // REVIEW
  'awards.verse.tag.noShow': 'thánh bùng kèo', // REVIEW
  'awards.verse.regular.1': 'Mưa rơi gió thổi mặc trời,\n{name} vẫn ra sân chẳng rời trận nào.', // REVIEW
  'awards.verse.regular.2': 'Tuần nào sân sáng đèn lên,\nThấy {name} có mặt vững bền đầu tiên.', // REVIEW
  'awards.verse.regular.3': 'Đường xa nắng sớm mưa chiều,\n{name} mê cầu tới đủ điều chẳng sai.', // REVIEW
  'awards.verse.back.1': 'Bao lâu vắng bóng sân nhà,\nHôm nay {name} lại ghé qua sân này.', // REVIEW
  'awards.verse.back.2': 'Vợt treo góc tủ bấy lâu,\nNay {name} tái xuất đánh cầu cực hăng.', // REVIEW
  'awards.verse.back.3': 'Tưởng đâu giải nghệ mất rồi,\nAi ngờ {name} lại sánh đôi vào kèo.', // REVIEW
  'awards.verse.noShow.1': 'Hẹn hò ra sân đánh cầu,\nĐến giờ chẳng thấy {name} đâu bóng hình.', // REVIEW
  'awards.verse.noShow.2': 'Lên kèo chốt chắc như đinh,\nTới giờ sân sáng một mình {name} quên.', // REVIEW
  'awards.verse.noShow.3': 'Trên nhóm đăng ký rõ nhanh,\nSân chờ mỏi mắt {name} đành ngủ quên.', // REVIEW
  'awards.board.heading': 'BẢNG VÀNG SÂN CẦU', // REVIEW
  'awards.board.subheading': 'BẢNG PHONG ĐỘ', // REVIEW
  'awards.board.subheadingDate': 'SAU TRẬN {date}', // REVIEW
  'awards.board.joinStreak': 'CHUỖI RA SÂN', // REVIEW
  'awards.board.comeback': 'TRỞ LẠI SAU (BUỔI)', // REVIEW
  'awards.board.guests': 'KHÁCH DẪN THEO', // REVIEW
  'awards.board.noShowStreak': 'CHUỖI BÙNG KÈO', // REVIEW
  'awards.board.tickerRegular': '{name} GIỮ CHUỖI {n} TRẬN', // REVIEW
  'awards.board.tickerBack': '{name} ĐÃ TRỞ LẠI SÂN SAU {n} BUỔI', // REVIEW
  'awards.board.tickerBack_one': '{name} ĐÃ TRỞ LẠI SÂN SAU {n} BUỔI', // REVIEW
  'awards.board.tickerGuest': '{name} DẪN THEO {n} KHÁCH', // REVIEW
  'awards.board.tickerGuest_one': '{name} DẪN THEO {n} KHÁCH', // REVIEW
  'awards.board.tickerNoShow': '{name}: HẸN GẶP TRẬN TỚI NHÉ?', // REVIEW
  'awards.cardTitle.awards': 'Lễ trao giải', // REVIEW
  'awards.cardTitle.wanted': 'Truy nã', // REVIEW
  'awards.cardTitle.verse': 'Ca dao sân cầu', // REVIEW
  'awards.cardTitle.board': 'Bảng vàng sân cầu', // REVIEW
  'awards.story.prev': 'Thẻ trước', // REVIEW
  'awards.story.next': 'Thẻ tiếp theo', // REVIEW
  'awards.story.pause': 'Tạm dừng', // REVIEW
  'awards.story.resume': 'Tiếp tục', // REVIEW

  'wallets.title': 'Ví', // REVIEW
  'wallets.whereMoneyIs': 'Tiền đang ở đâu', // REVIEW
  'wallets.viewAll': 'Ví', // REVIEW
  'wallets.add': 'Thêm ví', // REVIEW
  'wallets.everyday': 'Hằng ngày', // REVIEW
  'wallets.investment': 'Đầu tư', // REVIEW
  'wallets.archived': 'Đã lưu trữ', // REVIEW
  'wallets.other': 'Khác', // REVIEW
  'wallets.defaultBadge': 'Mặc định', // REVIEW
  'wallets.noRate': 'chưa có tỷ giá', // REVIEW
  'wallets.emptyTitle': 'Chưa có ví nào', // REVIEW
  'wallets.emptyBody': 'Tạo ví đầu tiên để bắt đầu theo dõi số dư.', // REVIEW
  'wallets.moveUp': 'Lên', // REVIEW
  'wallets.moveDown': 'Xuống', // REVIEW
  'wallets.reorder': 'Đổi thứ tự', // REVIEW
  'wallets.done': 'Xong', // REVIEW
  'wallets.totalWithAssets': 'Tổng gồm tài sản ≈ {total}', // REVIEW
  'wallet.notFound': 'Không tìm thấy ví', // REVIEW
  'wallet.costBasis': 'giá vốn ≈ {amount}', // REVIEW
  'wallet.entriesThisMonth': 'Giao dịch tháng này', // REVIEW
  'wallet.seeAll': 'Xem tất cả', // REVIEW
  'wallet.noEntries': 'Chưa có giao dịch trong tháng này', // REVIEW
  'wallet.beforeStart': 'Trước ngày bắt đầu ví', // REVIEW
  'wallet.actions': 'Tùy chọn ví', // REVIEW
  'wallet.edit': 'Sửa ví', // REVIEW
  'wallet.makeDefault': 'Đặt làm mặc định', // REVIEW
  'wallet.archive': 'Lưu trữ', // REVIEW
  'wallet.restore': 'Khôi phục', // REVIEW
  'wallet.delete': 'Xóa ví', // REVIEW
  'wallet.deleteConfirmTitle': 'Xóa ví?', // REVIEW
  'wallet.deleteConfirmBody': 'Ví "{name}" chưa có giao dịch nào và sẽ bị xóa vĩnh viễn.', // REVIEW
  'wallet.holdings': 'Đang nắm giữ', // REVIEW
  'wallet.holdingsSubtitle': 'Giá vốn, chưa tính giá thị trường', // REVIEW
  'wallet.noHoldings': 'Chưa nắm giữ tài sản nào', // REVIEW
  'walletForm.newTitle': 'Thêm ví mới', // REVIEW
  'walletForm.editTitle': 'Sửa ví', // REVIEW
  'walletForm.name': 'Tên ví', // REVIEW
  'walletForm.kind': 'Loại ví', // REVIEW
  'walletForm.currency': 'Tiền tệ', // REVIEW
  'walletForm.startAmount': 'Số dư ban đầu', // REVIEW
  'walletForm.negativeToggle': 'Số âm', // REVIEW
  'walletForm.startDate': 'Ngày bắt đầu', // REVIEW
  'walletForm.startCostVnd': 'Giá trị quy đổi (VND)', // REVIEW
  'walletForm.startCostVndHint': 'Để trống nếu chưa biết tỷ giá.', // REVIEW
  'walletForm.icon': 'Biểu tượng', // REVIEW
  'walletForm.changeIcon': 'Đổi biểu tượng ví', // REVIEW
  'walletForm.pickCurrency': 'Chọn tiền tệ', // REVIEW
  'walletForm.searchCurrency': 'Tìm mã hoặc tên tiền tệ...', // REVIEW
  'walletForm.popularCurrencies': 'Phổ biến', // REVIEW
  'walletForm.allCurrencies': 'Tất cả tiền tệ', // REVIEW
  'walletForm.noCurrencyMatch': 'Không tìm thấy tiền tệ phù hợp', // REVIEW
  'walletForm.pickIcon': 'Chọn biểu tượng', // REVIEW
  'walletForm.searchIcon': 'Tìm biểu tượng hoặc nhóm...', // REVIEW
  'walletForm.noIconMatch': 'Không tìm thấy biểu tượng phù hợp', // REVIEW
  'walletForm.iconTone': 'Màu nền biểu tượng', // REVIEW
  'walletForm.options': 'Tùy chọn', // REVIEW
  'walletForm.excludeFromReports': 'Không tính vào báo cáo tổng', // REVIEW
  'walletForm.excludeFromReportsHint': 'Bỏ qua giao dịch của ví này ở tổng quan và báo cáo', // REVIEW
  'walletForm.save': 'Lưu', // REVIEW
  'walletForm.lockedHint': 'Không thể đổi loại ví và tiền tệ khi đã có giao dịch.', // REVIEW
  'addMenu.expense': 'Khoản chi', // REVIEW
  'addMenu.income': 'Khoản thu', // REVIEW
  'addMenu.loanDebt': 'Vay/Nợ', // REVIEW
  'addMenu.transfer': 'Chuyển tiền', // REVIEW
  'addMenu.withPeople': 'Với người khác', // REVIEW
  'personalEntry.newTitle': 'Thêm giao dịch', // REVIEW
  'personalEntry.editTitle': 'Sửa giao dịch', // REVIEW
  'personalEntry.tabs': 'Loại giao dịch', // REVIEW
  'personalEntry.expense': 'Chi', // REVIEW
  'personalEntry.income': 'Thu', // REVIEW
  'personalEntry.loanDebt': 'Vay/Nợ', // REVIEW
  'personalEntry.transfer': 'Chuyển tiền', // REVIEW
  'personalEntry.transferToWallet': 'Chuyển sang ví', // REVIEW
  'personalEntry.transferFromWallet': 'Nhận từ ví', // REVIEW
  'personalEntry.wallet': 'Ví', // REVIEW
  'personalEntry.fromWallet': 'Từ ví', // REVIEW
  'personalEntry.toWallet': 'Đến ví', // REVIEW
  'personalEntry.pickWallet': 'Chọn ví', // REVIEW
  'personalEntry.amountSent': 'Số gửi', // REVIEW
  'personalEntry.amountReceived': 'Số nhận được', // REVIEW
  'personalEntry.date': 'Ngày', // REVIEW
  'personalEntry.note': 'Ghi chú', // REVIEW
  'personalEntry.notePlaceholder': 'Thêm ghi chú', // REVIEW
  'personalEntry.noNote': 'Không ghi chú', // REVIEW
  'personalEntry.addDetails': 'Thêm chi tiết', // REVIEW
  'personalEntry.moreDetails': 'Thêm chi tiết', // REVIEW
  'personalEntry.time': 'Giờ', // REVIEW
  'personalEntry.tags': 'Thẻ', // REVIEW
  'personalEntry.tagsPlaceholder': 'Thêm thẻ...', // REVIEW
  'personalEntry.removeTag': 'Xóa thẻ {name}', // REVIEW
  'personalEntry.excludeFromReports': 'Không tính vào báo cáo', // REVIEW
  'personalEntry.moreCategories': 'Khác', // REVIEW
  'personalEntry.pickCategory': 'Tất cả danh mục', // REVIEW
  'personalEntry.pickCategoryError': 'Hãy chọn một danh mục.', // REVIEW
  'personalEntry.categoryPromptExpense': 'Chi cho việc gì?', // REVIEW
  'personalEntry.categoryPromptIncome': 'Thu từ đâu?', // REVIEW
  'personalEntry.categoryLine': 'Danh mục', // REVIEW
  'personalEntry.amountReceivedError': 'Hãy nhập số tiền nhận được.', // REVIEW
  'personalEntry.differentWalletsError': 'Hãy chọn hai ví khác nhau.', // REVIEW
  'personalEntry.enterAmountReceived': 'Nhập số nhận được', // REVIEW
  'personalEntry.enterAmountSent': 'Nhập số gửi', // REVIEW
  'personalEntry.chooseDifferentWallets': 'Chọn hai ví khác nhau', // REVIEW
  'personalEntry.save': 'Lưu', // REVIEW
  'personalEntry.saveSummary': 'Lưu {amount} · {what}', // REVIEW
  'personalEntry.deleteDigit': 'Xóa', // REVIEW
  'personalEntry.done': 'Xong', // REVIEW
  'personalEntry.amountLabel': 'Số tiền: {amount}', // REVIEW
  'personalEntry.amountNotEntered': 'chưa nhập', // REVIEW
  'personalEntry.amountBoxLabel': 'Số tiền', // REVIEW
  'personalEntry.saved': 'Đã lưu', // REVIEW
  'personalEntry.notFound': 'Không tìm thấy giao dịch', // REVIEW
  'personalEntry.archivedWalletNotice': 'Ví này đã lưu trữ. Khôi phục ví để sửa giao dịch.', // REVIEW
  'personalEntry.noWalletTitle': 'Tạo ví trước', // REVIEW
  'personalEntry.goToWallets': 'Đến trang ví', // REVIEW
  'personalEntry.smallAmountTitle': 'Số tiền này đúng chưa?', // REVIEW
  'personalEntry.smallAmountBody': 'Bạn đang lưu {amount}.', // REVIEW
  'personalEntry.smallAmountMultiply': 'Lưu {amount}', // REVIEW
  'personalEntry.smallAmountKeep': 'Lưu {amount}', // REVIEW
  'personalEntry.walletChip': 'Ví: {name}, {currency}', // REVIEW
  'personalEntry.walletChipText': '{name} · {currency}', // REVIEW
  'personalEntry.foreignTitle': 'Lưu bằng {currency}?', // REVIEW
  'personalEntry.foreignBody': 'Bạn đang lưu {amount} từ ví {wallet}.', // REVIEW
  'personalEntry.foreignSave': 'Lưu {amount}', // REVIEW
  'personalEntry.foreignChangeWallet': 'Đổi ví', // REVIEW
  'personalEntry.savedExpense': 'Đã chi {amount} · {category}', // REVIEW
  'personalEntry.savedIncome': 'Đã thu {amount} · {category}', // REVIEW
  'personalEntry.savedTransfer': 'Đã chuyển {amount} → {wallet}', // REVIEW
  'personalEntry.discardTitle': 'Bỏ khoản đang nhập?', // REVIEW
  'personalEntry.discardConfirm': 'Bỏ', // REVIEW
  'personalEntry.discardKeepEditing': 'Tiếp tục nhập', // REVIEW
  'personalEntry.buyAsset': 'Mua tài sản', // REVIEW
  'personalEntry.sellAsset': 'Bán tài sản', // REVIEW
  'personalEntry.asset': 'Tài sản', // REVIEW
  'personalEntry.pickAsset': 'Chọn tài sản', // REVIEW
  'personalEntry.quantity': 'Số lượng', // REVIEW
  'personalEntry.heldQuantity': 'Đang có: {qty} {unit}', // REVIEW
  'personalEntry.oversellError': 'Chỉ còn {qty} {unit}', // REVIEW
  'personalEntry.savedBuy': 'Đã mua {qty} {asset}', // REVIEW
  'personalEntry.savedSell': 'Đã bán {qty} {asset}', // REVIEW
  'personalEntry.addAsset': 'Thêm tài sản', // REVIEW
  'personalEntry.searchAssets': 'Tìm tài sản...', // REVIEW
  'personalEntry.noAssets': 'Chưa có tài sản nào', // REVIEW
  'personalEntry.chooseAsset': 'Chọn tài sản', // REVIEW
  'personalEntry.enterQuantity': 'Nhập số lượng', // REVIEW
  'personalEntry.fixQuantity': 'Sửa số lượng để lưu', // REVIEW
  'transactions.title': 'Giao dịch', // REVIEW
  'transactions.recentTitle': 'Giao dịch gần đây', // REVIEW
  'transactions.allLink': 'Tất cả', // REVIEW
  'transactions.byDay': 'Theo ngày', // REVIEW
  'transactions.byCategory': 'Theo danh mục', // REVIEW
  'transactions.switchToCategory': 'Đang xem theo ngày. Nhấn để xem theo danh mục', // REVIEW
  'transactions.switchToDay': 'Đang xem theo danh mục. Nhấn để xem theo ngày', // REVIEW
  'transactions.beforeStartDivider': 'Trước ngày bắt đầu {wallet} ({date}) · không tính vào số dư', // REVIEW
  'transactions.spendingNetLabel': 'Chi tiêu', // REVIEW
  'transactions.netLabel': 'Thu chi', // REVIEW
  'transactions.backToThisMonth': 'Về tháng này', // REVIEW
  'transactions.addEntry': 'Thêm giao dịch', // REVIEW
  'transactions.withPeople': 'Với {names}', // REVIEW
  'transactions.yourShare': 'phần của bạn', // REVIEW
  'transactions.filters': 'Bộ lọc', // REVIEW
  'transactions.filterTitle': 'Lọc giao dịch', // REVIEW
  'transactions.searchLabel': 'Tìm kiếm', // REVIEW
  'transactions.searchPlaceholder': 'Tìm theo ghi chú hoặc #thẻ', // REVIEW
  'transactions.searchSubmit': 'Tìm', // REVIEW
  'transactions.clearSearch': 'Xóa nội dung tìm', // REVIEW
  'transactions.advancedFilters': 'Bộ lọc nâng cao', // REVIEW
  'transactions.noTagMatch': 'Không có thẻ nào khớp', // REVIEW
  'transactions.categoryLabel': 'Danh mục', // REVIEW
  'transactions.clearAll': 'Xóa tất cả', // REVIEW
  'transactions.allTime': 'Mọi lúc', // REVIEW
  'transactions.clearRange': 'Bỏ khoảng thời gian', // REVIEW
  'transactions.whenTitle': 'Chọn thời gian', // REVIEW
  'transactions.quickThisWeek': 'Tuần này', // REVIEW
  'transactions.quickLastWeek': 'Tuần trước', // REVIEW
  'transactions.quickThisMonth': 'Tháng này', // REVIEW
  'transactions.quickLastMonth': 'Tháng trước', // REVIEW
  'transactions.quickLast30': '30 ngày qua', // REVIEW
  'transactions.customRange': 'Tùy chọn', // REVIEW
  'transactions.rangeFromAfterTo': 'Ngày bắt đầu phải trước ngày kết thúc', // REVIEW
  'transactions.rangeTooLong': 'Chọn tối đa 1 năm', // REVIEW
  'transactions.loadingHistory': 'Đang tải toàn bộ lịch sử để tìm…', // REVIEW
  'transactions.backToFilters': 'Quay lại bộ lọc', // REVIEW
  'transactions.loadMore': 'Xem thêm', // REVIEW
  'transactions.typeAll': 'Tất cả', // REVIEW
  'transactions.typeTrade': 'Mua / bán', // REVIEW
  'transactions.typePerson': 'Với người khác', // REVIEW
  'transactions.allWallets': 'Tất cả ví', // REVIEW
  'transactions.allCategories': 'Tất cả danh mục', // REVIEW
  'transactions.allAssets': 'Tất cả tài sản', // REVIEW
  'transactions.allTags': 'Tất cả thẻ', // REVIEW
  'transactions.fromDate': 'Từ ngày', // REVIEW
  'transactions.toDate': 'Đến ngày', // REVIEW
  'transactions.applyFilters': 'Áp dụng', // REVIEW
  'transactions.resetFilters': 'Đặt lại', // REVIEW
  'transactions.clearFilters': 'Xóa bộ lọc', // REVIEW
  'transactions.noMatch': 'Không có giao dịch nào khớp bộ lọc.', // REVIEW
  'transactions.emptyTitle': 'Chưa có giao dịch nào', // REVIEW
  'transactions.emptyBody': 'Ghi chép khoản chi, thu hoặc chuyển tiền để theo dõi.', // REVIEW
  'transactions.loadOlder': 'Xem tháng trước', // REVIEW
  'transactions.backToTop': 'Lên đầu trang', // REVIEW
  'transactions.otherCategory': 'Khác', // REVIEW
  'transactions.prevMonth': 'Tháng trước', // REVIEW
  'transactions.nextMonth': 'Tháng sau', // REVIEW
  'transactions.monthLabel': 'Tháng {month}, {year}', // REVIEW
  'transactions.detailTitle': 'Chi tiết giao dịch', // REVIEW
  'transactions.edit': 'Sửa', // REVIEW
  'transactions.delete': 'Xóa', // REVIEW
  'transactions.deleteConfirmTitle': 'Xóa giao dịch?', // REVIEW
  'transactions.deleteConfirmBody': 'Giao dịch này sẽ bị xóa. Bạn có thể hoàn tác trong 5 giây.', // REVIEW
  'transactions.deleteTransferBody': 'Cả hai bên của giao dịch chuyển tiền sẽ bị xóa. Bạn có thể hoàn tác trong 5 giây.', // REVIEW
  'transactions.deleted': 'Đã xóa', // REVIEW
  'transactions.removeFilter': 'Xóa bộ lọc {label}', // REVIEW
  'transactions.directionTo': '→ {wallet}', // REVIEW
  'transactions.directionFrom': '← {wallet}', // REVIEW
  'transactions.buyAssetTitle': 'Mua {asset}', // REVIEW
  'transactions.sellAssetTitle': 'Bán {asset}', // REVIEW
  'transactions.pricePerUnit': 'Giá mỗi {unit}', // REVIEW
  'transactions.transfersAndSettleUp': 'Chuyển khoản & Trả nợ', // REVIEW

  'groupRow.yourShare': 'phần của bạn', // REVIEW
  'groupRow.youPaid': 'Bạn trả {total} · {rest} mọi người nợ bạn', // REVIEW
  'groupRow.youPaidShort': 'Trả trước {total}', // REVIEW
  'groupRow.paidBy': '{name} trả', // REVIEW
  'groupRow.fund': 'Vào quỹ nhóm', // REVIEW
  'groupRow.payment': 'Thanh toán', // REVIEW
  'groupRow.paymentInMeta': 'Hoàn tiền nhóm', // REVIEW
  'groupRow.paymentOutMeta': 'Trả nợ nhóm', // REVIEW
  'groupRow.paymentTo': 'Bạn trả {name}', // REVIEW
  'groupRow.paymentFrom': '{name} trả bạn', // REVIEW
  'groupRow.notInSpending': 'Không tính chi tiêu', // REVIEW
  'groupRow.notInIncome': 'Không tính thu nhập', // REVIEW
  'groupRow.notFromWallet': 'Chưa trừ ví', // REVIEW
  'groupRow.paymentWalletOut': 'Trừ {amount} khỏi ví {wallet}', // REVIEW
  'groupRow.paymentWalletIn': 'Cộng {amount} vào ví {wallet}', // REVIEW
  'groupRow.paymentNotCountedNote': 'Không tính thêm vào chi tiêu (đã tính ở khoản chi gốc).', // REVIEW
  'groupRow.paymentNotCountedInNote': 'Không tính thêm vào thu nhập (hoàn lại khoản bạn đã trả hộ).', // REVIEW
  'groupRow.pending': 'Chờ duyệt · chưa tính', // REVIEW
  'groupRow.pendingShort': 'Chưa tính', // REVIEW
  'groupRow.openInGroup': 'Xem trong nhóm', // REVIEW
  'groupRow.sheetTitle': 'Khoản từ nhóm', // REVIEW
  'groupRow.editInGroup': 'Số tiền và người chia chỉ sửa được trong nhóm.', // REVIEW
  'groupRow.deleteConfirmBody': 'Khoản chi này sẽ bị xóa ngay và không thể hoàn tác.', // REVIEW
  'filters.group': 'Nhóm', // REVIEW
  'filters.showGroupRows': 'Hiện khoản từ nhóm', // REVIEW
  'filters.hidingGroupRows': 'Đã ẩn khoản từ nhóm', // REVIEW
  'settings.groupCategory': 'Danh mục cho khoản nhóm', // REVIEW
  'settings.countLoans': 'Tính khoản vay vào chi tiêu', // REVIEW
  'settings.groupCategoryHint': 'Dùng khi khoản từ nhóm chưa có danh mục riêng', // REVIEW
  'settings.countLoansHint': 'Cho vay tính là chi, được trả lại tính là thu', // REVIEW
  'balanceCheck.question': 'Số dư có khớp với ngân hàng không?', // REVIEW
  'balanceCheck.enter': 'Nhập số dư thật', // REVIEW
  'balanceCheck.skip': 'Bỏ qua', // REVIEW
  'balanceCheck.saved': 'Đã điều chỉnh số dư', // REVIEW

  'personalSettings.title': 'Cài đặt sổ chi tiêu', // REVIEW
  'personalSettings.wallets': 'Ví', // REVIEW
  'personalSettings.categories': 'Nhóm chi tiêu', // REVIEW
  'personalSettings.assets': 'Tài sản', // REVIEW
  'personalSettings.tags': 'Thẻ', // REVIEW
  'categories.title': 'Danh mục chi tiêu', // REVIEW
  'categories.tabs': 'Loại danh mục', // REVIEW
  'categories.hiddenBadge': 'Đã ẩn', // REVIEW
  'categories.add': 'Thêm danh mục', // REVIEW
  'categories.edit': 'Sửa', // REVIEW
  'categories.hide': 'Ẩn', // REVIEW
  'categories.show': 'Hiện', // REVIEW
  'categories.delete': 'Xóa', // REVIEW
  'categories.newTitle': 'Thêm danh mục', // REVIEW
  'categories.editTitle': 'Sửa danh mục', // REVIEW
  'categories.name': 'Tên danh mục', // REVIEW
  'categories.icon': 'Biểu tượng', // REVIEW
  'categories.pickIcon': 'Chọn biểu tượng', // REVIEW
  'categories.iconSearch': 'Tìm biểu tượng...', // REVIEW
  'categories.noIconResults': 'Không tìm thấy biểu tượng phù hợp.', // REVIEW
  'categories.parent': 'Danh mục cha', // REVIEW
  'categories.pickParent': 'Chọn danh mục cha', // REVIEW
  'categories.noParent': 'Không có (danh mục chính)', // REVIEW
  'categories.parentLockedHasChildren': 'Đang có {count} danh mục con — chuyển các danh mục con trước để đổi danh mục cha.', // REVIEW
  'categories.parentNoOtherParents': 'Chưa có danh mục chính nào khác để chuyển vào.', // REVIEW
  'categories.visibilityShiftNote': 'Lưu xong sẽ đổi mặc định hiển thị ở: {wallets}. Bạn vẫn chỉnh riêng được ở “Hiện ở ví”.', // REVIEW
  'categories.visibilityShiftShow': 'hiện ở {wallet}', // REVIEW
  'categories.visibilityShiftHide': 'ẩn ở {wallet}', // REVIEW
  'categories.movedToParentToast': 'Đã chuyển “{name}” sang “{parent}”', // REVIEW
  'categories.promotedToast': 'Đã đưa “{name}” lên làm danh mục chính', // REVIEW
  'categories.save': 'Lưu', // REVIEW
  'categories.emptyTitle': 'Chưa có danh mục nào', // REVIEW
  'categories.emptyBody': 'Thêm danh mục để phân loại thu chi.', // REVIEW
  'categories.deleteConfirmTitle': 'Xóa danh mục?', // REVIEW
  'categories.deleteConfirmBody': 'Bạn có chắc muốn xóa danh mục “{name}”?', // REVIEW
  'categories.hasChildrenError': 'Danh mục này đang có danh mục con. Hãy chuyển hoặc xóa các danh mục con trước.', // REVIEW
  'categories.deleteParentTitle': 'Xóa “{name}”', // REVIEW
  'categories.deleteParentBody': 'Danh mục này đang có {count} danh mục con. Chọn nơi chuyển các danh mục con trước khi xóa:', // REVIEW
  'categories.deleteParentMoreChildren': '+{count} danh mục nữa', // REVIEW
  'categories.promoteChildren': 'Lên làm danh mục chính', // REVIEW
  'categories.promoteChildrenDesc': 'Các danh mục con sẽ tách ra thành danh mục chính độc lập.', // REVIEW
  'categories.moveChildrenToParent': 'Chuyển sang danh mục cha khác', // REVIEW
  'categories.moveChildrenTargetLabel': 'Chọn danh mục cha mới', // REVIEW
  'categories.deleteParentDirectTx': '“{name}” cũng đang có {count} giao dịch trực tiếp. Chọn danh mục để chuyển các giao dịch này:', // REVIEW
  'categories.moveChildrenAndDelete': 'Chuyển danh mục con và xóa', // REVIEW
  'categories.deletedParentPromotedToast': 'Đã xóa “{name}” và đưa {count} danh mục con lên danh mục chính', // REVIEW
  'categories.deletedParentMovedToast': 'Đã xóa “{name}” và chuyển {count} danh mục con sang “{parent}”', // REVIEW
  'categories.inUseTitle': 'Đang có {count} giao dịch', // REVIEW
  'categories.moveToOther': 'Chuyển sang danh mục khác', // REVIEW
  'categories.moveAndDelete': 'Chuyển và xóa', // REVIEW
  'categories.hideInstead': 'Ẩn danh mục, giữ lịch sử', // REVIEW
  'categories.editAria': 'Sửa {name}', // REVIEW
  'categories.hideAria': 'Ẩn {name}', // REVIEW
  'categories.showAria': 'Hiện {name}', // REVIEW
  'tags.title': 'Thẻ', // REVIEW
  'tags.useCount': '{count} giao dịch', // REVIEW
  'tags.rename': 'Đổi tên', // REVIEW
  'tags.delete': 'Xóa', // REVIEW
  'tags.renameTitle': 'Đổi tên thẻ', // REVIEW
  'tags.name': 'Tên thẻ', // REVIEW
  'tags.save': 'Lưu', // REVIEW
  'tags.renameConflict': 'Đã có thẻ tên này', // REVIEW
  'tags.deleteConfirmTitle': 'Xóa thẻ?', // REVIEW
  'tags.deleteConfirmBody': 'Thẻ sẽ bị gỡ khỏi {count} giao dịch', // REVIEW
  'tags.emptyTitle': 'Chưa có thẻ nào', // REVIEW
  'tags.emptyBody': 'Gắn thẻ khi thêm giao dịch để lọc nhanh hơn.', // REVIEW
  'loanDebt.withWho': 'Với ai', // REVIEW
  'loanDebt.choosePeople': 'Chọn người', // REVIEW
  'loanDebt.splitDifferently': 'Chia khác', // REVIEW
  'loanDebt.splitSummaryCount': '{mode} · {n} người', // REVIEW
  'loanDebt.enterAmount': 'Nhập số tiền', // REVIEW
  'loanDebt.chooseOnePerson': 'Chọn ít nhất một người', // REVIEW
  'loanDebt.splitMismatch': 'Cách chia chưa khớp với số tiền', // REVIEW
  'loanDebt.enterNote': 'Nhập ghi chú', // REVIEW
  'split.word.equal': 'Đều', // REVIEW
  'split.word.amounts': 'Số tiền', // REVIEW
  'split.word.percent': '%', // REVIEW
  'split.word.shares': 'Phần', // REVIEW
  'split.word.adjust': 'Cộng/trừ', // REVIEW
  'entryDate.today': 'Hôm nay', // REVIEW
  'entryDate.yesterday': 'Hôm qua', // REVIEW
  'entryDate.chipPick': 'Chọn ngày', // REVIEW
  'entryDate.changeTime': 'Đổi giờ', // REVIEW
  'entryDate.rowLabel': 'Ngày: {value}', // REVIEW
  'entryDate.withTime': '{day} · {time}', // REVIEW
  'entryDate.rowAria': '{day}, {time}', // REVIEW
  'entryDate.dayFormat': '{weekday}, {day}/{month}', // REVIEW
  'entryDate.dayFormatYear': '{weekday}, {day}/{month}/{year}', // REVIEW
  'entryDate.wd.0': 'Chủ Nhật', // REVIEW
  'entryDate.wd.1': 'Thứ Hai', // REVIEW
  'entryDate.wd.2': 'Thứ Ba', // REVIEW
  'entryDate.wd.3': 'Thứ Tư', // REVIEW
  'entryDate.wd.4': 'Thứ Năm', // REVIEW
  'entryDate.wd.5': 'Thứ Sáu', // REVIEW
  'entryDate.wd.6': 'Thứ Bảy', // REVIEW
  'entryDate.mon.0': '1', // REVIEW
  'entryDate.mon.1': '2', // REVIEW
  'entryDate.mon.2': '3', // REVIEW
  'entryDate.mon.3': '4', // REVIEW
  'entryDate.mon.4': '5', // REVIEW
  'entryDate.mon.5': '6', // REVIEW
  'entryDate.mon.6': '7', // REVIEW
  'entryDate.mon.7': '8', // REVIEW
  'entryDate.mon.8': '9', // REVIEW
  'entryDate.mon.9': '10', // REVIEW
  'entryDate.mon.10': '11', // REVIEW
  'entryDate.mon.11': '12', // REVIEW
  'assets.title': 'Tài sản', // REVIEW
  'assets.add': 'Thêm tài sản', // REVIEW
  'assets.newTitle': 'Thêm tài sản', // REVIEW
  'assets.editTitle': 'Sửa tài sản', // REVIEW
  'assets.name': 'Tên', // REVIEW
  'assets.unit': 'Đơn vị', // REVIEW
  'assets.group': 'Nhóm', // REVIEW
  'assets.otherGroup': 'Nhóm khác', // REVIEW
  'assets.otherGroupPlaceholder': 'Nhập tên nhóm', // REVIEW
  'assets.decimals': 'Số chữ số thập phân', // REVIEW
  'assets.decimalsDecrease': 'Giảm số chữ số thập phân', // REVIEW
  'assets.decimalsIncrease': 'Tăng số chữ số thập phân', // REVIEW
  'assets.decimalsLocked': 'Đã có giao dịch, không đổi được bước nhỏ nhất', // REVIEW
  'assets.unitHelp': 'Số (vd 0.0001) là bước nhỏ nhất; chữ (vd chỉ) là tên đơn vị', // REVIEW
  'assets.unitStepError': 'Nhập bước nhỏ nhất như 1, 0.1, 0.01…', // REVIEW
  'assets.unitRequired': 'Nhập đơn vị', // REVIEW
  'assets.duplicateName': 'Đã có tài sản tên này', // REVIEW
  'assets.save': 'Lưu', // REVIEW
  'assets.emptyTitle': 'Chưa có tài sản nào', // REVIEW
  'assets.hiddenSection': 'Đã ẩn', // REVIEW
  'assets.hiddenBadge': 'Đã ẩn', // REVIEW
  'assets.edit': 'Sửa', // REVIEW
  'assets.hide': 'Ẩn', // REVIEW
  'assets.show': 'Hiện', // REVIEW
  'assets.delete': 'Xóa', // REVIEW
  'assets.deleteConfirmTitle': 'Xóa tài sản?', // REVIEW
  'assets.deleteConfirmBody': 'Bạn có chắc muốn xóa tài sản "{name}"?', // REVIEW
  'assets.inUseTitle': 'Đang có {count} giao dịch', // REVIEW
  'assets.moveToOther': 'Chuyển giao dịch sang…', // REVIEW
  'assets.noSameDecimalsTarget': 'Không có tài sản nào cùng số chữ số thập phân.', // REVIEW
  'assets.hideInstead': 'Ẩn và giữ lịch sử', // REVIEW
  'assets.decimalsSummary': '{decimals} số thập phân', // REVIEW
  'assets.editAria': 'Sửa {name}', // REVIEW
  'assets.hideAria': 'Ẩn {name}', // REVIEW
  'assets.showAria': 'Hiện {name}', // REVIEW
  'wallet.holdingAvgPrice': '~{price}/{unit}', // REVIEW
  'wallet.holdingsTotal': 'Tổng vốn · {count} tài sản', // REVIEW
  'wallet.holdingsTotalWithCash': 'Tổng · {count} tài sản + tiền mặt', // REVIEW
  'wallet.cashRow': 'Tiền mặt', // REVIEW
  'wallet.balanceLabel': 'Số dư', // REVIEW
  'wallet.totalInclAssets': 'Tổng gồm tài sản', // REVIEW
  'entry.shareWith': 'Chia với ai? (không bắt buộc)', // REVIEW
  'entry.me': 'Bạn', // REVIEW
  'entry.flip': 'Đổi người trả', // REVIEW
  'outcome.myShare': 'Phần bạn {amount}', // REVIEW
  'outcome.owesMe': '{name} nợ bạn {amount}', // REVIEW
  'outcome.eachOwesMe': '{names} mỗi người nợ bạn {amount}', // REVIEW
  'outcome.iOwe': 'Bạn nợ {name} {amount}', // REVIEW
  'outcome.paidBy': '{name} trả', // REVIEW
  'loanDebt.withWhoQ': 'Với ai?', // REVIEW
  'visibility.walletSheetTitle': 'Hiện trong ví này', // REVIEW
  'visibility.categories': 'Danh mục', // REVIEW
  'visibility.expense': 'Chi', // REVIEW
  'visibility.income': 'Thu', // REVIEW
  'visibility.assets': 'Tài sản', // REVIEW
  'visibility.itemRowLabel': 'Hiện ở ví', // REVIEW
  'visibility.allWallets': 'Tất cả ví', // REVIEW
  'visibility.onlyWallet': 'Chỉ {wallet}', // REVIEW
  'visibility.nWallets': '{n} ví', // REVIEW
  'visibility.noWallets': 'Không ví nào', // REVIEW
  'visibility.saveFailed': 'Chưa lưu được thay đổi. Hãy thử lại.', // REVIEW
  'visibility.expand': 'Mở rộng {name}', // REVIEW
  'visibility.collapse': 'Thu gọn {name}', // REVIEW
  'visibility.save': 'Lưu', // REVIEW

  'reports.title': 'Báo cáo', // REVIEW
  'reports.backToBook': 'Sổ chi tiêu', // REVIEW
  'reports.backToReports': 'Báo cáo', // REVIEW
  'reports.categoryDrilldownTitle': '{name}', // REVIEW
  'reports.modeWeek': 'Tuần', // REVIEW
  'reports.modeMonth': 'Tháng', // REVIEW
  'reports.modeYear': 'Năm', // REVIEW
  'reports.modeCustom': 'Tùy chọn', // REVIEW
  'reports.prevPeriod': 'Kỳ trước', // REVIEW
  'reports.nextPeriod': 'Kỳ sau', // REVIEW
  'reports.customFrom': 'Từ ngày', // REVIEW
  'reports.customTo': 'Đến ngày', // REVIEW
  'reports.applyCustom': 'Áp dụng', // REVIEW
  'reports.monthLabel': 'Tháng {month}', // REVIEW
  'reports.yearLabel': 'Năm {year}', // REVIEW
  'reports.weekLabel': '{from} – {to}', // REVIEW
  'reports.customLabel': '{from} – {to}', // REVIEW
  'reports.allWallets': 'Tất cả ví', // REVIEW
  'reports.walletScope': 'Ví: {name}', // REVIEW
  'reports.groupsToggle': 'Tiền nhóm', // REVIEW
  'reports.approximateVnd': '≈ VND', // REVIEW
  'reports.spent': 'Đã chi', // REVIEW
  'reports.income': 'Đã thu', // REVIEW
  'reports.net': 'Chênh lệch', // REVIEW
  'reports.vsSamePeriod': 'so với cùng thời điểm kỳ trước', // REVIEW
  'reports.vsSamePeriodMonth': 'so với cùng thời điểm tháng trước', // REVIEW
  'reports.vsPreviousPeriod': 'so với {label}', // REVIEW
  'reports.noBaselineYet': 'Chưa đủ dữ liệu kỳ trước để so sánh', // REVIEW
  'reports.summaryMore': 'Chi nhiều hơn {pct}% so với {target}', // REVIEW
  'reports.summaryLess': 'Chi ít hơn {pct}% so với {target}', // REVIEW
  'reports.summarySame': 'Chi bằng với {target}', // REVIEW
  'reports.summaryNoPrevSpend': 'Không có khoản chi nào {target}', // REVIEW
  'reports.summaryTargetSamePoint': 'cùng thời điểm kỳ trước', // REVIEW
  'reports.summaryTargetSamePointMonth': 'cùng thời điểm tháng trước', // REVIEW
  'reports.summaryTargetSamePointYear': 'cùng thời điểm năm trước', // REVIEW
  'reports.summaryTargetSamePointWeek': 'cùng thời điểm tuần trước', // REVIEW
  'reports.summaryTargetSamePointAt': 'vào cùng thời điểm kỳ trước', // REVIEW
  'reports.summaryTargetPeriod': '{label}', // REVIEW
  'reports.summaryTargetPeriodMonth': 'tháng {label}', // REVIEW
  'reports.summaryTargetPeriodYear': 'năm {label}', // REVIEW
  'reports.summaryTargetInPeriod': 'trong {label}', // REVIEW
  'reports.summaryTargetInPeriodMonth': 'trong tháng {label}', // REVIEW
  'reports.summaryTargetInPeriodYear': 'trong năm {label}', // REVIEW
  'reports.summaryUsual': 'Mức thường ({count} kỳ trước): {amount}', // REVIEW
  'reports.healthTitle': 'Thu & Chi trong kỳ', // REVIEW
  'reports.cumulativeSubtitle': 'Cộng dồn', // REVIEW
  'reports.legendIncome': 'Thu', // REVIEW
  'reports.legendExpense': 'Chi', // REVIEW
  'reports.legendAvgIncome': 'Thu thường ({count} kỳ trước)', // REVIEW
  'reports.legendAvgExpense': 'Chi thường ({count} kỳ trước)', // REVIEW
  'reports.healthChartSummary': 'Biểu đồ cộng dồn: đã chi {spent}, đã thu {income} trong kỳ.', // REVIEW
  'reports.categoryTitle': 'Theo danh mục', // REVIEW
  'reports.tabExpense': 'Chi tiêu', // REVIEW
  'reports.tabIncome': 'Thu nhập', // REVIEW
  'reports.noExpenseCategory': 'Chưa có chi tiêu trong kỳ', // REVIEW
  'reports.noIncomeCategory': 'Chưa có thu nhập trong kỳ', // REVIEW
  'reports.generalParentBucket': '{name} (chung)', // REVIEW
  'reports.uncategorized': 'Chưa phân loại', // REVIEW
  'reports.subCategoriesTitle': 'Chi tiết theo mục con', // REVIEW
  'reports.allSubCategoriesFilter': 'Tất cả', // REVIEW
  'reports.clearSubFilter': 'Xóa lọc', // REVIEW
  'reports.matchingTransactions': 'Giao dịch ({count})', // REVIEW
  'reports.noMatchingTransactions': 'Không có giao dịch nào trong kỳ này.', // REVIEW
  'reports.previousPeriodTotal': 'Kỳ trước', // REVIEW
  'reports.baselineAvgLabel': 'Mức thường ({count} kỳ trước)', // REVIEW
  'reports.viewCategoryHint': 'Nhấn để xem chi tiết', // REVIEW
  'reports.tagsTitle': 'Theo thẻ', // REVIEW
  'reports.tagsShowAll': 'Xem tất cả ({count} thẻ)', // REVIEW
  'reports.tagsCollapse': 'Thu gọn', // REVIEW
  'reports.tagsSearchPlaceholder': 'Tìm thẻ...', // REVIEW
  'reports.tagsNoSearchMatch': 'Không tìm thấy thẻ phù hợp', // REVIEW
  'reports.tagsMultiOverlapNote': 'Một giao dịch có thể gắn nhiều thẻ, nên cộng các thanh lại có thể lớn hơn tổng của kỳ.', // REVIEW
  'reports.noTagsData': 'Chưa có giao dịch gắn thẻ trong kỳ', // REVIEW
  'reports.tagsEntryCount': '{count} giao dịch', // REVIEW
  'reports.tagsViewTransactions': 'Xem giao dịch', // REVIEW
  'reports.walletBalanceTitle': 'Số dư theo thời gian', // REVIEW
  'reports.balanceOpening': 'Đầu kỳ', // REVIEW
  'reports.balanceClosing': 'Cuối kỳ', // REVIEW
  'reports.balanceNetChange': 'Tăng/giảm', // REVIEW
  'reports.balanceMin': 'Thấp nhất', // REVIEW
  'reports.balanceMax': 'Cao nhất', // REVIEW
  'reports.balanceChartSummary': 'Biểu đồ số dư: từ {opening} đến {closing}, thấp nhất {min}, cao nhất {max}.', // REVIEW
  'reports.excludedWalletBanner': 'Ví này không tính vào báo cáo tổng — đang xem riêng ví này', // REVIEW
  'reports.unratedNoticeTitle': 'Một số giao dịch ngoại tệ chưa có tỷ giá', // REVIEW
  'reports.unratedNoticeBody': '{name} ({currency}) chưa có tỷ giá sang VND nên chưa gộp vào biểu đồ VND.', // REVIEW
  'reports.unratedInspectWallet': 'Xem ví {name}', // REVIEW
  'reports.unratedOnlyNote': 'Các giao dịch trong kỳ hiện thuộc ví ngoại tệ chưa có tỷ giá sang VND.', // REVIEW
  'reports.emptyTitle': 'Chưa có giao dịch trong kỳ này', // REVIEW
  'reports.emptyBody': 'Thử chuyển sang kỳ khác hoặc xóa bộ lọc ví để xem dữ liệu.', // REVIEW
  'reports.clearFilters': 'Xóa bộ lọc', // REVIEW
  'reports.perCurrencyBreakdown': 'Chi tiết theo tiền tệ', // REVIEW
  'reports.loadError': 'Không tải được dữ liệu báo cáo.', // REVIEW
  'reports.retry': 'Thử lại', // REVIEW

  'sharedExpense.titleLabel': 'Tiêu đề', // REVIEW
  'sharedExpense.titlePlaceholder': 'VD: Ăn tối quán nướng', // REVIEW
  'sharedExpense.titleRequired': 'Nhập tiêu đề', // REVIEW
  'sharedExpense.pickCategory': 'Chọn danh mục', // REVIEW
  'sharedExpense.clearCategory': 'Bỏ chọn', // REVIEW
  'sharedExpense.searchCategory': 'Tìm danh mục…', // REVIEW
  'sharedExpense.payer': 'Người trả', // REVIEW
  'sharedExpense.note': 'Nội dung', // REVIEW
  'sharedExpense.notePlaceholder': 'Ghi chú thêm (không bắt buộc)', // REVIEW
  'categories.builtIn': 'Có sẵn', // REVIEW
  'categories.hiddenSection': 'Đã ẩn', // REVIEW
  'categories.mergeInto': 'Gộp vào…', // REVIEW
  'categories.mergeTitle': 'Gộp “{name}” vào…', // REVIEW
  'categories.mergeEmpty': 'Chưa có danh mục cố định nào.', // REVIEW
  'categories.mergeSearchPlaceholder': 'Tìm danh mục…', // REVIEW
  'categories.mergeNoResults': 'Không tìm thấy danh mục phù hợp.', // REVIEW
  'categories.mergeConfirmTitle': 'Gộp danh mục?', // REVIEW
  'categories.mergeConfirmBody': 'Gộp “{from}” vào “{to}”? Các giao dịch sẽ chuyển sang “{to}”.', // REVIEW
  'categories.mergeConfirmAction': 'Gộp', // REVIEW
  'categories.hiddenToast': 'Đã ẩn “{name}”', // REVIEW
  'categories.shownToast': 'Đã hiện “{name}”', // REVIEW
};
