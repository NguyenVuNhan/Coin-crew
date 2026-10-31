import type { MessageKey } from './en';

export const vi: Record<MessageKey, string> = {
  'common.retry': 'Thử lại', // REVIEW
  'common.cancel': 'Hủy', // REVIEW
  'common.continue': 'Tiếp tục', // REVIEW
  'common.back': 'Quay lại', // REVIEW
  'common.close': 'Đóng', // REVIEW
  'common.undo': 'Hoàn tác', // REVIEW

  'error.generic': 'Có lỗi xảy ra. Thử lại.', // REVIEW
  'error.dailyLimit': 'Đã vượt giới hạn miễn phí hôm nay. Thử lại sau 07:00.', // REVIEW
  'error.linkDead': 'Liên kết này không còn hoạt động. Hãy xin trưởng nhóm liên kết mới.', // REVIEW
  'error.rateLimited': 'Quá nhiều mục đang chờ duyệt. Hãy nhờ một thành viên duyệt trước.', // REVIEW

  'lang.vi': 'Tiếng Việt', // REVIEW
  'lang.en': 'English', // REVIEW
  'lang.switchTo': 'Chuyển sang {lang}', // REVIEW

  'time.justNow': 'vừa xong', // REVIEW
  'time.minutesAgo': '{n} phút trước', // REVIEW
  'time.hoursAgo': '{n} giờ trước', // REVIEW
  'time.daysAgo': '{n} ngày trước', // REVIEW

  'fewest.title': 'Ít lần chuyển khoản nhất', // REVIEW
  'fewest.explain': 'Khoản nợ của mọi người được gom lại để số lần chuyển khoản là ít nhất. Tổng số tiền mỗi người phải trả không đổi.', // REVIEW

  'who.lastUsedHere': 'Lần trước bạn đã chọn người này trên điện thoại này', // REVIEW
  'who.activeElsewhere': 'Đang hoạt động trên máy khác · {ago}', // REVIEW
  'who.someoneNew': 'Không có trong danh sách? Thêm tên của bạn', // REVIEW
  'who.areYou': 'Bạn là {name} phải không?', // REVIEW
  'who.yesIm': 'Đúng, tôi là {name}', // REVIEW
  'who.noAddMe': 'Không, thêm tôi vào', // REVIEW

  'expenses.disabledBy': 'Đã bị vô hiệu hóa bởi {name}', // REVIEW
  'expense.sendForApproval': 'Gửi để duyệt', // REVIEW

  'approvals.paidYou': '{name} báo đã chuyển khoản cho bạn {amount}', // REVIEW
  'approvals.didItArrive': 'Bạn đã nhận được tiền chưa?', // REVIEW

  'pay.payWithVietQr': 'Thanh toán bằng VietQR', // REVIEW
  'pay.keepNote': 'Giữ nguyên nội dung chuyển khoản này để đối soát thanh toán.', // REVIEW
  'pay.bankPending': 'Thông tin ngân hàng của {name} đang chờ duyệt', // REVIEW
  'pay.bankNone': '{name} chưa thêm thông tin ngân hàng', // REVIEW
  'pay.openBankApp': 'Mở ứng dụng ngân hàng', // REVIEW
  'pay.saveQr': 'Lưu mã QR', // REVIEW

  'landing.headline': 'Chia tiền chuyến đi. Thanh toán bằng VietQR.', // REVIEW
  'landing.tagline': 'Bạn bè tham gia từ một liên kết trong nhóm chat, không cần tài khoản.', // REVIEW
  'landing.signIn': 'Đăng nhập bằng Google', // REVIEW
  'landing.howItWorks': 'Cách hoạt động', // REVIEW
  'landing.step1': 'Tạo chuyến đi', // REVIEW
  'landing.step1Body': 'Thêm những người đi cùng.', // REVIEW
  'landing.step2': 'Chia sẻ một liên kết', // REVIEW
  'landing.step2Body': 'Mọi người tự thêm khoản đã chi.', // REVIEW
  'landing.step3': 'Thanh toán bằng VietQR', // REVIEW
  'landing.step3Body': 'Chuyển khoản cho nhau bằng mã VietQR.', // REVIEW

  'trips.title': 'Nhóm của bạn', // REVIEW
  'trips.new': 'Tạo nhóm mới', // REVIEW
  'trips.emptyTitle': 'Tạo nhóm đầu tiên của bạn', // REVIEW
  'trips.emptyBody': 'Tạo nhóm chuyến đi hoặc thể thao, rồi chia sẻ một liên kết cho cả nhóm.', // REVIEW
  'trips.youreOwed': 'Bạn được nhận', // REVIEW
  'trips.youOwe': 'Bạn cần trả', // REVIEW
  'trips.settled': 'Đã thanh toán xong', // REVIEW
  'trips.archived': 'đã lưu trữ', // REVIEW

  'account.label': 'Tài khoản', // REVIEW
  'account.language': 'Ngôn ngữ', // REVIEW
  'account.signOut': 'Đăng xuất', // REVIEW
  'account.changePhoto': 'Đổi ảnh đại diện', // REVIEW
  'account.cropTitle': 'Cắt & chỉnh ảnh đại diện', // REVIEW
  'account.zoom': 'Thu phóng', // REVIEW
  'account.savePhoto': 'Lưu ảnh', // REVIEW
  'account.removePhoto': 'Xóa ảnh', // REVIEW
  'account.saveProfile': 'Lưu hồ sơ', // REVIEW
  'account.displayName': 'Tên hiển thị', // REVIEW
  'account.gender': 'Giới tính', // REVIEW
  'trips.accountAria': 'Tài khoản', // REVIEW
  'trips.signOut': 'Đăng xuất', // REVIEW

  'home.title': 'CoinCrew', // REVIEW
  'home.tabPeople': 'Mọi người', // REVIEW
  'home.tabGroups': 'Nhóm', // REVIEW
  'home.tabActivity': 'Hoạt động', // REVIEW
  'home.newExpense': 'Thêm khoản chi', // REVIEW
  'home.owedToYou': 'Nợ bạn', // REVIEW
  'home.youOwe': 'Bạn nợ', // REVIEW
  'home.peopleEmptyTitle': 'Không có khoản nợ nào', // REVIEW
  'home.peopleEmptyBody': 'Thêm một khoản chi và chọn người chia cùng.', // REVIEW
  'home.stillCounting': 'Đang cộng thêm vài nhóm…', // REVIEW
  'home.waiting': 'Chờ bạn xác nhận', // REVIEW
  'trip.tabExpenses': 'Chi tiêu', // REVIEW
  'trip.tabPayments': 'Thanh toán', // REVIEW
  'trip.tabs': 'Các tab', // REVIEW
  'people.genderMale': 'Nam',
  'people.genderFemale': 'Nữ',

  'create.title': 'Tạo nhóm mới', // REVIEW
  'create.tripName': 'Tên nhóm', // REVIEW
  'create.tripNamePlaceholder': 'Đà Lạt · Th10 2026', // REVIEW
  'create.presetLabel': 'Loại nhóm', // REVIEW
  'create.presetTrip': 'Chuyến đi / Chung', // REVIEW
  'create.presetSport': 'Nhóm thể thao', // REVIEW
  'create.sportNamePlaceholder': 'Cầu lông tối thứ 5', // REVIEW
  'create.myName': 'Tên của bạn', // REVIEW
  'create.others': 'Ai sẽ tham gia cùng?', // REVIEW
  'create.otherPlaceholder': 'Tên', // REVIEW
  'create.addPerson': 'Thêm người', // REVIEW
  'create.removePerson': 'Xóa {name}', // REVIEW
  'create.bankTitle': 'Thông tin ngân hàng của bạn (không bắt buộc)', // REVIEW
  'create.bankHint': 'Để bạn bè có thể chuyển khoản trả bạn qua VietQR. Bạn có thể thêm sau.', // REVIEW
  'create.submit': 'Tạo nhóm', // REVIEW
  'create.suggestTitle': 'Từ các chuyến đi gần đây', // REVIEW
  'create.hasAccount': '{name} · có tài khoản', // REVIEW
  'create.alreadyListed': '{name} đã có trong danh sách với tài khoản của họ.', // REVIEW

  'gender.label': 'Giới tính của {name}', // REVIEW
  'gender.M': 'Nam', // REVIEW
  'gender.F': 'Nữ', // REVIEW
  'gender.unset': '—', // REVIEW

  'bank.bank': 'Ngân hàng', // REVIEW
  'bank.popular': 'Phổ biến', // REVIEW
  'bank.allBanks': 'Tất cả ngân hàng', // REVIEW
  'bank.choose': 'Chọn ngân hàng', // REVIEW
  'bank.search': 'Tìm ngân hàng', // REVIEW
  'bank.noResults': 'Không tìm thấy ngân hàng', // REVIEW
  'bank.accountNumber': 'Số tài khoản', // REVIEW
  'bank.holderName': 'Tên chủ tài khoản', // REVIEW
  'bank.holderHint': 'Như hiển thị trên ngân hàng, không dấu.', // REVIEW

  'consent.title': 'Trước khi bắt đầu', // REVIEW
  'consent.body': 'Chúng tôi lưu tên, email, các chuyến đi bạn tham gia và thông tin ngân hàng bạn thêm, để nhóm của bạn có thể chia tiền và thanh toán cho nhau.', // REVIEW
  'consent.agree': 'Tôi đồng ý với thông báo quyền riêng tư', // REVIEW
  'consent.readNotice': 'Đọc thông báo quyền riêng tư', // REVIEW

  'privacy.title': 'Thông báo quyền riêng tư', // REVIEW
  'privacy.draft': 'Bản nháp — đang chờ duyệt pháp lý', // REVIEW

  'join.opening': 'Đang mở chuyến đi…', // REVIEW

  'who.title': 'Bạn là ai?', // REVIEW
  'who.subtitle': 'Chọn tên của bạn để tiếp tục.', // REVIEW
  'who.continueAs': 'Tiếp tục với tên {name}', // REVIEW
  'who.hasAccount': 'Đã có tài khoản · nhấn để đăng nhập', // REVIEW
  'who.search': 'Tìm tên', // REVIEW
  'who.clearSearch': 'Xóa tìm kiếm', // REVIEW
  'who.count': '{shown} trên {total} người', // REVIEW
  'who.addNamed': 'Không có trong danh sách? Thêm "{name}"', // REVIEW
  'who.pending': 'Đang chờ duyệt', // REVIEW
  'who.newTitle': 'Tên của bạn là gì?', // REVIEW
  'who.newHint': 'Dùng tên mà bạn bè hay gọi bạn.', // REVIEW
  'who.nameLabel': 'Tên của bạn', // REVIEW
  'who.inTrip': 'Đã có trong chuyến đi này', // REVIEW
  'who.similar': '"{typed}" có vẻ giống "{name}", người đã có trong chuyến đi này.', // REVIEW
  'who.newPendingNote': 'Một thành viên sẽ kiểm tra tên mới trước khi xuất hiện trong chuyến đi.', // REVIEW
  'who.joinAs': 'Không có trong danh sách? Tham gia với tên {name}', // REVIEW
  'who.joinButton': 'Tham gia với tên {name}', // REVIEW
  'who.rejoinAs': 'Vào lại với tên {name}', // REVIEW
  'who.rejoinHint': 'Bạn đã rời nhóm này · các khoản chi trước đây vẫn còn', // REVIEW

  'guest.viewingAs': 'Đang xem với tư cách {name}', // REVIEW
  'guest.switch': 'Không phải {name}? Đổi tên', // REVIEW
  'guest.ifApprovedOwe': 'Nếu các khoản chi của bạn được duyệt, bạn sẽ cần trả {amount}', // REVIEW
  'guest.ifApprovedOwed': 'Nếu các khoản chi của bạn được duyệt, bạn sẽ được nhận {amount}', // REVIEW
  'guest.ifApprovedSettled': 'Nếu các khoản chi của bạn được duyệt, bạn sẽ thanh toán hết', // REVIEW
  'guest.yourShare': 'Cách tính phần của bạn', // REVIEW
  'guest.yourTotal': 'Tổng của bạn', // REVIEW
  'guest.becomeMember': 'Đăng nhập bằng Google để trở thành thành viên', // REVIEW
  'guest.memberRequested': 'Bạn đã yêu cầu trở thành thành viên. Một thành viên sẽ duyệt yêu cầu này.', // REVIEW

  'trip.total': 'Tổng chuyến đi {amount}', // REVIEW
  'trip.people': '{n} người', // REVIEW
  'trip.balances': 'Số dư', // REVIEW
  'trip.expenses': 'Khoản chi', // REVIEW
  'trip.addExpense': '+ Thêm khoản chi', // REVIEW
  'trip.pays': '{from} → {to}', // REVIEW
  'trip.viewOnly': 'Chỉ xem', // REVIEW
  'trip.you': 'Bạn', // REVIEW
  'trip.allSettled': 'Mọi người đã thanh toán hết.', // REVIEW

  'expense.youPaid': 'Bạn đã trả', // REVIEW
  'expense.personPaid': '{name} đã trả', // REVIEW
  'split.equal': 'chia đều, {n}', // REVIEW
  'split.amounts': 'số tiền chính xác', // REVIEW
  'split.percent': 'theo phần trăm', // REVIEW
  'split.shares': 'theo phần chia', // REVIEW
  'split.adjust': 'có điều chỉnh', // REVIEW
  'split.sport': 'chia theo buổi chơi', // REVIEW
  'status.waiting': 'Đang chờ', // REVIEW
  'status.rejected': 'Bị từ chối', // REVIEW
  'status.disabled': 'Đã vô hiệu hóa', // REVIEW
  'expense.rejectedBecause': 'Bị từ chối: {reason}', // REVIEW

  'expenseForm.titleNew': 'Thêm khoản chi', // REVIEW
  'expenseForm.titleEdit': 'Chỉnh sửa khoản chi', // REVIEW
  'expenseForm.whatFor': 'Chi tiêu cho', // REVIEW
  'expenseForm.whatForPlaceholder': 'Bánh tráng nướng, chợ đêm', // REVIEW
  'expenseForm.amount': 'Số tiền', // REVIEW
  'expenseForm.amountHint': 'Bạn có thể nhập 180.000, 50k hoặc 1,5tr.', // REVIEW
  'expenseForm.amountInvalid': 'Nhập số tiền như 180.000, 50k hoặc 1,5tr.', // REVIEW
  'expenseForm.date': 'Ngày', // REVIEW
  'expenseForm.paidBy': 'Người trả', // REVIEW
  'expenseForm.me': '{name} (tôi)', // REVIEW
  'expenseForm.choosePayer': 'Chọn người trả', // REVIEW
  'expenseForm.peopleLeft': '{names} đã rời nhóm nên không còn trong khoản chi này.', // REVIEW
  'expenseForm.personLeft': 'Có người trong khoản chi này đã rời nhóm. Kiểm tra lại cách chia rồi thử lại.', // REVIEW
  'expenseForm.split': 'Chia tiền', // REVIEW
  'expenseForm.include': 'Bao gồm {name}', // REVIEW
  'expenseForm.amountFor': 'Số tiền của {name}', // REVIEW
  'expenseForm.percentFor': 'Phần trăm của {name}', // REVIEW
  'expenseForm.sharesFor': 'Số phần của {name}', // REVIEW
  'expenseForm.adjustFor': 'Khoản điều chỉnh của {name}', // REVIEW
  'expenseForm.add': 'Thêm khoản chi', // REVIEW
  'expenseForm.save': 'Lưu thay đổi', // REVIEW
  'expenseForm.guestNote': 'Một thành viên trong nhóm sẽ duyệt trước khi tính.', // REVIEW
  'split.tab.equal': 'Chia đều', // REVIEW
  'split.tab.sport': 'Chia theo buổi chơi', // REVIEW
  'split.mode.equal': 'Chia đều', // REVIEW
  'split.mode.exact': 'Số tiền chính xác', // REVIEW
  'split.mode.percent': 'Phần trăm', // REVIEW
  'split.mode.shares': 'Số phần', // REVIEW
  'split.mode.adjust': 'Điều chỉnh', // REVIEW
  'split.mode.sport': 'Thể thao', // REVIEW
  'split.captionEqual': 'Chia đều · {n} người · mỗi người {each}', // REVIEW
  'split.captionEqualAbout': 'Chia đều · {n} người · mỗi người khoảng {each}', // REVIEW
  'split.captionEqualNone': 'Chia đều · {n} người', // REVIEW
  'split.captionExact': 'Số tiền chính xác · {n} người', // REVIEW
  'split.captionExactLeft': 'Số tiền chính xác · {n} người · còn {amount} chưa chia', // REVIEW
  'split.captionExactOver': 'Số tiền chính xác · {n} người · vượt {amount}', // REVIEW
  'split.captionPercent': 'Theo phần trăm · {n} người', // REVIEW
  'split.captionPercentLeft': 'Theo phần trăm · {n} người · còn {pct}%', // REVIEW
  'split.captionPercentOver': 'Theo phần trăm · {n} người · vượt {pct}%', // REVIEW
  'split.captionShares': 'Theo số phần · {n} người', // REVIEW
  'split.captionAdjust': 'Chia đều có điều chỉnh · {n} người', // REVIEW
  'split.captionPercentShare': 'Theo phần trăm · {n} người · {k} người chia {pct}% còn lại', // REVIEW
  'split.captionPercentLeftFor': 'Theo phần trăm · {n} người · còn {pct}% cho {name}', // REVIEW
  'split.captionPercentNothing': 'Theo phần trăm · {n} người · {k} người không phải trả', // REVIEW
  'split.captionPercentNothingOne': 'Theo phần trăm · {n} người · {name} không phải trả', // REVIEW
  'split.captionExactShare': 'Số tiền chính xác · {n} người · {k} người chia {amount} còn lại', // REVIEW
  'split.captionExactLeftFor': 'Số tiền chính xác · {n} người · còn {amount} cho {name}', // REVIEW
  'split.captionExactNothing': 'Số tiền chính xác · {n} người · {k} người không phải trả', // REVIEW
  'split.captionExactNothingOne': 'Số tiền chính xác · {n} người · {name} không phải trả', // REVIEW
  'splitBetween.label': 'Chia cho · {n}/{total} người', // REVIEW
  'splitBetween.everyone': 'Chia cho · Mọi người ({n})', // REVIEW
  'splitBetween.none': 'Chưa có ai', // REVIEW
  'splitBetween.change': 'Đổi', // REVIEW
  'splitBetween.you': 'Bạn', // REVIEW
  'splitBetween.aria': '{label}. {names}. Đổi', // REVIEW
  'splitSheet.title': 'Chia cho', // REVIEW
  'splitSheet.count': '{n}/{total} người', // REVIEW
  'splitSheet.recent': 'Giống nhóm người ở', // REVIEW
  'splitSheet.recentMeta': '{date} · {n} người · {names}', // REVIEW
  'splitSheet.more': '+{n}', // REVIEW
  'splitSheet.use': 'Dùng', // REVIEW
  'splitSheet.useAria': 'Dùng nhóm người của {description}', // REVIEW
  'splitSheet.clearAll': 'Bỏ chọn hết', // REVIEW
  'splitSheet.addEveryone': 'Chọn mọi người', // REVIEW
  'splitSheet.searchLabel': 'Thêm người', // REVIEW
  'splitSheet.searchPlaceholder': 'Thêm người…', // REVIEW
  'splitSheet.remove': 'Bỏ {name}', // REVIEW
  'splitSheet.add': 'Thêm {name}', // REVIEW
  'splitSheet.alreadyIn': 'Đã có: {names}', // REVIEW
  'splitSheet.noMatch': 'Không có ai tên "{q}" trong nhóm.', // REVIEW
  'splitSheet.allChosen': 'Đã chọn tất cả mọi người trong nhóm.', // REVIEW
  'splitSheet.matches': '{n} kết quả', // REVIEW
  'splitSheet.done': 'Xong', // REVIEW
  'expense.notYours': 'Chỉ người đã thêm khoản chi này mới có thể chỉnh sửa.', // REVIEW
  'expense.historyTitle': 'Lịch sử chỉnh sửa', // REVIEW
  'expense.rollback': 'Khôi phục về bản cập nhật này', // REVIEW
  'expense.editedBy': 'Chỉnh sửa bởi {name} · {date}', // REVIEW
  'splitError.NO_PARTICIPANTS': 'Chọn ít nhất một người.', // REVIEW
  'splitError.INVALID_AMOUNT': 'Nhập số tiền trước.', // REVIEW
  'splitError.AMOUNTS_DONT_ADD_UP': 'Tổng số tiền không khớp với tổng chi phí.', // REVIEW
  'splitError.PERCENT_NOT_100': 'Tổng phần trăm phải bằng 100%.', // REVIEW
  'splitError.SHARES_NOT_POSITIVE': 'Mỗi phần chia phải lớn hơn 0.', // REVIEW
  'splitError.NEGATIVE_SHARE': 'Khoản điều chỉnh lớn hơn tổng số tiền.', // REVIEW

  'sport.whatForPlaceholder': 'Cầu lông tối thứ 5 · Sân 3', // REVIEW
  'sport.costsTitle': 'Chi phí buổi chơi', // REVIEW
  'sport.court': 'Tiền sân', // REVIEW
  'sport.shuttlecocks': 'Tiền cầu', // REVIEW
  'sport.qty': 'SL', // REVIEW
  'sport.unitPrice': 'Đơn giá', // REVIEW
  'sport.addShuttlePrice': '+ Thêm loại cầu', // REVIEW
  'sport.addShuttlecock': 'Thêm tiền cầu', // REVIEW
  'sport.addExtraFee': 'Thêm phụ phí', // REVIEW
  'sport.removeShuttleRow': 'Xóa dòng cầu {n}', // REVIEW
  'sport.removeExtraFee': 'Xóa phụ phí', // REVIEW
  'sport.extra': 'Phụ phí (nước, gửi xe…)', // REVIEW
  'sport.totalBar': '{slots} suất ({f} Nữ, {m} Nam)', // REVIEW
  'sport.totalLabel': 'Tổng cộng', // REVIEW
  'sport.ruleTitle': 'Quy tắc Nam / Nữ', // REVIEW
  'sport.ruleEqual': 'Đều', // REVIEW
  'sport.ruleDiscount': 'Lệch ₫', // REVIEW
  'sport.ruleRatio': 'Tỷ lệ', // REVIEW
  'sport.femaleDiscountLabel': 'Nữ giảm mỗi suất', // REVIEW
  'sport.maleWeightLabel': 'Tỷ lệ Nam', // REVIEW
  'sport.femaleWeightLabel': 'Tỷ lệ Nữ', // REVIEW
  'sport.slotSummary': 'Nam: {m} · Nữ: {f}', // REVIEW
  'sport.slotsBadge': '{f} Nữ · {m} Nam', // REVIEW
  'sport.oneMale': '1 Nam', // REVIEW
  'sport.oneFemale': '1 Nữ', // REVIEW
  'sport.fixedBadge': 'Cố định', // REVIEW
  'sport.femaleSlotsFor': 'Số suất Nữ của {name}', // REVIEW
  'sport.maleSlotsFor': 'Số suất Nam của {name}', // REVIEW
  'sport.sameAsFemale': '= Nữ', // REVIEW
  'sport.fixedFor': 'Số tiền cố định của {name}', // REVIEW
  'sport.clearFixed': 'Bỏ cố định cho {name}', // REVIEW
  'sport.bringsGuest': 'Người chơi này có dẫn khách?', // REVIEW
  'sport.femaleGuest': 'Khách Nữ', // REVIEW
  'sport.maleGuest': 'Khách Nam', // REVIEW
  'sport.orFixedAmount': 'Hoặc đặt số tiền cố định cho {name}', // REVIEW
  'sport.editGender': 'Đổi giới tính', // REVIEW
  'sport.shareBillQr': 'Chia sẻ bill & QR', // REVIEW
  'sport.zaloPreviewTitle': 'Tin nhắn Zalo & bảng tính', // REVIEW
  'sport.tableColName': 'TÊN', // REVIEW
  'sport.tableColFemale': 'NỮ', // REVIEW
  'sport.tableColMale': 'NAM', // REVIEW
  'sport.tableColAmount': 'THÀNH TIỀN', // REVIEW
  'sport.tableTotalSlots': 'TỔNG SUẤT', // REVIEW
  'sport.tableCosts': 'CHI PHÍ', // REVIEW
  'sport.tablePerSlot': 'MỖI SUẤT', // REVIEW

  'member.settings': 'Cài đặt chuyến đi', // REVIEW

  'balance.owed': 'Bạn được nhận', // REVIEW
  'balance.owe': 'Bạn cần trả', // REVIEW
  'balance.oweName': 'Bạn cần trả {name}', // REVIEW
  'balance.settled': 'Bạn đã thanh toán xong', // REVIEW
  'balance.tripTotal': 'Tổng chuyến đi {total}', // REVIEW
  'balance.received': 'đã nhận {amount}', // REVIEW
  'balance.waitingFor': '{amount} đang chờ {name} xác nhận', // REVIEW

  'invite.button': 'Mời', // REVIEW
  'invite.title': 'Mời bạn bè', // REVIEW
  'invite.cardTitle': 'Mời nhóm của bạn', // REVIEW
  'invite.cardBody': 'Gửi liên kết này vào nhóm chat. Bạn bè chọn tên của mình, không cần tài khoản.', // REVIEW
  'invite.share': 'Chia sẻ', // REVIEW
  'invite.shareText': 'Tham gia "{trip}" để chia tiền:', // REVIEW

  'expenses.emptyTitle': 'Thêm khoản chi đầu tiên', // REVIEW
  'expenses.emptyBody': 'Homestay, ăn uống, xăng xe: mọi thứ cả nhóm dùng chung.', // REVIEW
  'expenses.emptyViewer': 'Chưa có khoản chi nào.', // REVIEW

  'approvals.title': 'Cần duyệt', // REVIEW
  'approvals.allTitle': 'Đang chờ duyệt', // REVIEW
  'approvals.position': '{i} trên {n} đang chờ', // REVIEW
  'approvals.previous': 'Trước', // REVIEW
  'approvals.next': 'Tiếp', // REVIEW
  'approvals.seeAll': 'Xem tất cả {n}', // REVIEW
  'approvals.addedBy': '{name} đã thêm · {amount} · {split}', // REVIEW
  'approvals.differentAmount': 'Số tiền nhận khác?', // REVIEW
  'approvals.approve': 'Duyệt', // REVIEW
  'approvals.edit': 'Chỉnh sửa', // REVIEW
  'approvals.reject': 'Từ chối', // REVIEW
  'approvals.rejectReason': 'Lý do từ chối?', // REVIEW
  'approvals.name': '{name} muốn tham gia', // REVIEW
  'approvals.looksLike': 'Có vẻ giống {name}', // REVIEW
  'approvals.sameAs': 'Là {name}', // REVIEW
  'approvals.bank': '{name} đã thêm thông tin ngân hàng', // REVIEW
  'approvals.confirm': 'Xác nhận', // REVIEW
  'approvals.didntArrive': 'Chưa nhận được', // REVIEW
  'approvals.amountReceived': 'Số tiền nhận được', // REVIEW
  'approvals.notArrived': '{name} báo chưa nhận được {amount} từ {payer}', // REVIEW
  'approvals.disable': 'Vô hiệu hóa', // REVIEW
  'approvals.keep': 'Giữ lại', // REVIEW
  'approvals.membership': '{name} muốn trở thành thành viên', // REVIEW
  'approvals.approveNameFirst': 'Duyệt {name} trước', // REVIEW

  'whoPays.remindCopied': 'Đã sao chép lời nhắc — dán vào nhóm chat.', // REVIEW
  'whoPays.paid': 'Đã trả ✓', // REVIEW

  'transfers.mine': 'Khoản chuyển của bạn', // REVIEW
  'transfers.all': 'Ai trả ai', // REVIEW
  'transfers.showAll': 'Xem tất cả', // REVIEW
  'transfers.showMine': 'Chỉ của tôi', // REVIEW
  'transfers.addBank': 'Thêm thông tin ngân hàng để có mã QR', // REVIEW
  'transfers.markReceived': 'Đánh dấu đã nhận {amount} từ {name}', // REVIEW
  'transfers.markPaid': 'Đánh dấu đã trả {amount} cho {name}', // REVIEW
  'transfers.received': 'Đã nhận', // REVIEW
  'transfers.paid': 'Tôi đã trả', // REVIEW
  'transfers.receivedSnack': '{name} đã trả {amount}', // REVIEW
  'transfers.paidSnack': 'Bạn đã trả {name} {amount}', // REVIEW
  'transfers.waitingFor': 'Đang chờ {name}', // REVIEW
  'transfers.nothingDue': '{name} hiện không nợ bạn khoản nào.', // REVIEW
  'transfers.alreadySettled': 'Khoản này đã được ghi nhận. Danh sách đã được cập nhật.', // REVIEW
  'payments.title': 'Các khoản đã trả', // REVIEW
  'payments.disable': 'Tắt', // REVIEW
  'payments.enable': 'Bật lại', // REVIEW
  'payments.reported': 'Đã báo. Một thành viên sẽ kiểm tra.', // REVIEW
  'payments.notArrivedPill': 'Chưa nhận được', // REVIEW
  'remind.text': 'Chào {name}! Bạn còn {amount} cần trả {creditor} cho chuyến "{trip}". Xem chi tiết và chuyển khoản bằng VietQR: {link}', // REVIEW

  'expenses.disable': 'Vô hiệu hóa', // REVIEW
  'expenses.enable': 'Kích hoạt lại', // REVIEW

  'share.groupLink': 'Liên kết nhóm', // REVIEW
  'share.groupHint': 'Gửi vào nhóm chat của bạn. Bạn bè chọn tên của mình — không cần tài khoản.', // REVIEW
  'share.viewLink': 'Liên kết chỉ xem', // REVIEW
  'share.viewHint': 'Những người có liên kết này có thể xem nhưng không thể thay đổi.', // REVIEW
  'share.copy': 'Sao chép', // REVIEW
  'share.copied': 'Đã sao chép', // REVIEW
  'share.imageTitle': 'Lưu ảnh', // REVIEW
  'share.longPress': 'Nhấn giữ ảnh (2 giây) để Lưu về máy hoặc Chia sẻ ngay vào nhóm Zalo', // REVIEW
  'share.messageCopied': 'Đã sao chép tin nhắn — dán vào nhóm Zalo', // REVIEW
  'share.copyMessage': 'Sao chép tin nhắn', // REVIEW
  'share.openInBrowser': 'Không lưu được? Nhấn ⋯ → Mở bằng trình duyệt', // REVIEW
  'share.imageFailed': 'Không tạo được ảnh.', // REVIEW
  'share.regenerate': 'Tạo liên kết mới', // REVIEW
  'share.regenerateConfirm': 'Liên kết cũ sẽ ngừng hoạt động. Tạo liên kết mới?', // REVIEW

  'settings.title': 'Cài đặt nhóm', // REVIEW
  'settings.people': 'Thành viên', // REVIEW
  'settings.activity': 'Hoạt động', // REVIEW
  'settings.archive': 'Lưu trữ nhóm', // REVIEW
  'settings.archiveConfirm': 'Không ai có thể thay đổi chuyến đi này cho đến khi bạn bỏ lưu trữ. Lưu trữ?', // REVIEW
  'settings.archived': 'Chuyến đi này đã được lưu trữ. Bạn vẫn có thể xem.', // REVIEW
  'settings.unarchive': 'Bỏ lưu trữ nhóm', // REVIEW
  'settings.unarchiveHint': 'Mọi người có thể thay đổi trở lại.', // REVIEW
  'settings.bank': 'Thông tin ngân hàng của bạn', // REVIEW
  'settings.language': 'Ngôn ngữ', // REVIEW
  'settings.dangerZone': 'Vùng nguy hiểm', // REVIEW
  'settings.archiveHint': 'Không ai có thể thay đổi chuyến đi đã lưu trữ cho đến khi người tổ chức bỏ lưu trữ.', // REVIEW
  'settings.leave': 'Rời nhóm', // REVIEW
  'settings.leaveHint': 'Nhóm sẽ không còn trong danh sách của bạn. Các khoản chi trước đây vẫn được giữ, và bạn có thể vào lại bằng link nhóm.', // REVIEW
  'settings.leaveConfirm': 'Rời {group}?', // REVIEW

  'people.title': 'Thành viên', // REVIEW
  'people.organiser': 'Trưởng nhóm', // REVIEW
  'people.admin': 'Quản trị viên', // REVIEW
  'people.adminBadge': 'Quản trị viên', // REVIEW
  'people.makeAdmin': 'Chỉ định quản trị viên', // REVIEW
  'people.member': 'Thành viên', // REVIEW
  'people.guest': 'Khách', // REVIEW
  'people.merge': 'Hợp nhất', // REVIEW
  'people.mergeInto': 'Hợp nhất {name} vào…', // REVIEW
  'people.mergeConfirm': 'Chuyển toàn bộ khoản chi và thanh toán từ {from} sang {into}?', // REVIEW
  'people.mergeExplain': 'Hợp nhất sẽ chuyển mọi khoản chi và thanh toán từ tên này sang tên khác, xử lý các trường hợp trùng lặp.', // REVIEW
  'people.remove': 'Xóa', // REVIEW
  'people.useMerge': 'Dùng hợp nhất thay thế', // REVIEW
  'people.removeConfirm': 'Xóa {name} khỏi nhóm? Các khoản chi và thanh toán trước đây vẫn được giữ.', // REVIEW
  'people.cannotRemove': 'Bạn không thể xóa người này.', // REVIEW
  'people.leftTitle': 'Đã rời nhóm', // REVIEW
  'people.leftBadge': 'Đã rời', // REVIEW
  'people.leftOwes': 'Còn nợ {amount}', // REVIEW
  'people.leftOwed': 'Cần nhận {amount}', // REVIEW
  'people.leftSettled': 'Đã thanh toán xong', // REVIEW
  'people.restore': 'Thêm lại', // REVIEW

  'activity.title': 'Hoạt động', // REVIEW
  'activity.empty': 'Chưa có hoạt động nào.', // REVIEW
  'activity.someone': 'Ai đó', // REVIEW
  'activity.line': '{actor} {action}', // REVIEW
  'activity.today': 'Hôm nay', // REVIEW
  'activity.yesterday': 'Hôm qua', // REVIEW
  'activity.device': 'thiết bị', // REVIEW
  'activity.expenseAdded': '{actor} đã thêm {description} · {amount}', // REVIEW
  'activity.expenseEdited': '{actor} đã sửa {description} · {amount}', // REVIEW
  'activity.expenseApproved': '{actor} đã duyệt {description}', // REVIEW
  'activity.expenseRejected': '{actor} đã từ chối {description}', // REVIEW
  'activity.paymentRecorded': '{from} đã trả {to} {amount}', // REVIEW
  'activity.paymentConfirmed': '{actor} đã xác nhận một khoản thanh toán · {amount}', // REVIEW
  'activity.nameAdded': '{actor} đã thêm {name}', // REVIEW
  'activity.nameApproved': '{actor} đã duyệt {name}', // REVIEW
  'activity.nameMerged': '{actor} đã hợp nhất {from} vào {into}', // REVIEW
  'activity.personRemoved': '{actor} đã xóa {name}', // REVIEW
  'activity.personRestored': '{actor} đã thêm lại {name}', // REVIEW
  'activity.action.trip_created': 'đã tạo chuyến đi', // REVIEW
  'activity.action.expense_added': 'đã thêm khoản chi', // REVIEW
  'activity.action.expense_edited': 'đã sửa khoản chi', // REVIEW
  'activity.action.expense_deleted': 'đã xóa khoản chi', // REVIEW
  'activity.action.expense_approved': 'đã duyệt khoản chi', // REVIEW
  'activity.action.expense_rejected': 'đã từ chối khoản chi', // REVIEW
  'activity.action.expense_disabled': 'đã vô hiệu hóa khoản chi', // REVIEW
  'activity.action.expense_enabled': 'đã kích hoạt lại khoản chi', // REVIEW
  'activity.action.name_added': 'đã thêm tên', // REVIEW
  'activity.action.name_approved': 'đã duyệt tên mới', // REVIEW
  'activity.action.name_merged': 'đã hợp nhất hai tên', // REVIEW
  'activity.action.person_removed': 'đã xóa một người', // REVIEW
  'activity.action.person_left': 'đã rời nhóm', // REVIEW
  'activity.action.person_restored': 'đã thêm lại một người', // REVIEW
  'activity.action.member_joined': 'đã tham gia', // REVIEW
  'activity.action.member_rejoined': 'đã vào lại', // REVIEW
  'activity.action.bank_submitted': 'đã thêm thông tin ngân hàng', // REVIEW
  'activity.action.bank_approved': 'đã duyệt thông tin ngân hàng', // REVIEW
  'activity.action.bank_rejected': 'đã từ chối thông tin ngân hàng', // REVIEW
  'activity.action.payment_recorded': 'đã ghi nhận thanh toán', // REVIEW
  'activity.action.payment_confirmed': 'đã xác nhận thanh toán', // REVIEW
  'activity.action.payment_not_arrived': 'báo chưa nhận được tiền', // REVIEW
  'activity.action.payment_disabled': 'đã vô hiệu hóa thanh toán', // REVIEW
  'activity.action.payment_enabled': 'đã kích hoạt lại thanh toán', // REVIEW
  'activity.action.links_regenerated': 'đã tạo lại liên kết', // REVIEW
  'activity.action.trip_archived': 'đã lưu trữ chuyến đi', // REVIEW
  'activity.action.trip_unarchived': 'đã bỏ lưu trữ chuyến đi', // REVIEW
  'activity.action.fewest_changed': 'đã thay đổi cài đặt ít lần chuyển khoản nhất', // REVIEW
  'activity.action.membership_requested': 'đã yêu cầu trở thành thành viên', // REVIEW
  'activity.action.membership_approved': 'đã duyệt thành viên mới', // REVIEW
  'activity.action.membership_rejected': 'đã từ chối thành viên mới', // REVIEW

  'pay.title': 'Thanh toán cho {name}', // REVIEW
  'pay.toLine': 'đến {holder} · {bank}', // REVIEW
  'pay.iPaid': 'Tôi đã chuyển', // REVIEW
  'pay.iPaidHint': 'Chạm sau khi tiền đã rời khỏi tài khoản của bạn.', // REVIEW
  'pay.sentTitle': 'Đã gửi thanh toán · {amount}', // REVIEW
  'pay.sentBody': 'Đang chờ {name} xác nhận đã nhận được. Trang này sẽ tự động cập nhật.', // REVIEW
  'pay.mistake': 'Chuyển nhầm? Nhờ {name} chạm "Chưa nhận được".', // REVIEW
  'pay.paidTitle': 'Đã trả · {amount} cho {name}', // REVIEW
  'pay.paidBody': 'Được tính ngay.', // REVIEW
  'pay.stillOwed': 'Còn nợ {amount}', // REVIEW
  'pay.showQrRest': 'Hiện mã QR cho phần còn lại', // REVIEW
  'pay.bankAskThem': 'Nhờ họ thêm thông tin, rồi quay lại đây.', // REVIEW
  'pay.scanWithPhone': 'Quét mã QR bằng ứng dụng ngân hàng trên điện thoại của bạn.', // REVIEW
  'pay.account': 'Số tài khoản', // REVIEW
  'pay.note': 'Nội dung chuyển khoản', // REVIEW
  'pay.copyAccount': 'Sao chép số tài khoản', // REVIEW
  'pay.copyNote': 'Sao chép nội dung', // REVIEW
  'pay.copied': 'Đã sao chép', // REVIEW
  'pay.qrAlt': 'Mã VietQR thanh toán cho {name} {amount}', // REVIEW
  'pay.tapToCheck': 'Chạm để kiểm tra lại', // REVIEW
  'pay.waitingConfirm': 'Đang chờ {name} xác nhận', // REVIEW
  'pay.nothingOwed': 'Hiện tại bạn không nợ {name} khoản nào.', // REVIEW
  'pay.chooseApp': 'Chọn ứng dụng ngân hàng của bạn', // REVIEW
  'pay.fillsIn': 'tự động điền thông tin thanh toán', // REVIEW
  'pay.zaloBankHint': 'Ứng dụng ngân hàng không mở? Lưu mã QR, rồi trong app ngân hàng chọn Quét QR → chọn ảnh. Hoặc nhấn ⋯ → Mở bằng trình duyệt.', // REVIEW
  'pay.remindThem': 'Nhắc {name}', // REVIEW
  'pay.share': 'Chia sẻ', // REVIEW
  'pay.shareSaved': 'Đã lưu mã QR và sao chép lời nhắn.', // REVIEW
  'pay.shareFailed': 'Không chia sẻ được. Hãy thử Lưu mã QR.', // REVIEW
  'pay.remindBankText': 'Chào {name}! Nhớ thêm thông tin ngân hàng trong "{trip}" để mình chuyển khoản trả bạn qua VietQR nhé: {link}', // REVIEW

  'bankForm.title': 'Thông tin ngân hàng của bạn', // REVIEW
  'bankForm.guestNote': 'Một thành viên sẽ duyệt thông tin ngân hàng mới trước khi người khác có thể chuyển khoản cho bạn.', // REVIEW
  'bankForm.memberNote': 'Đã lưu vào hồ sơ của bạn và được dùng trong tất cả chuyến đi.', // REVIEW
  'bankForm.save': 'Lưu thông tin ngân hàng', // REVIEW
  'bankForm.saved': 'Đã lưu', // REVIEW
  'bankForm.pending': 'Đang chờ một thành viên duyệt thông tin ngân hàng của bạn.', // REVIEW
  'bankForm.consentLabel': 'Tôi đồng ý với {link}', // REVIEW
  'bankForm.privacyLink': 'thông báo quyền riêng tư', // REVIEW
  'bankForm.addPrompt': 'Thêm thông tin ngân hàng để bạn bè có thể chuyển khoản trả bạn qua VietQR.', // REVIEW

  'rows.swipeHint': 'Vuốt trái hoặc chạm vào dòng để xem tùy chọn', // REVIEW

  'details.expense': 'Khoản chi', // REVIEW
  'details.payment': 'Khoản chuyển', // REVIEW
  'details.date': 'Ngày', // REVIEW
  'details.paidBy': 'Người trả', // REVIEW
  'details.addedBy': 'Người thêm', // REVIEW
  'details.split': 'Cách chia', // REVIEW
  'details.you': '{name} (bạn)', // REVIEW
  'details.amountClaimed': 'Số tiền đã gửi', // REVIEW
  'details.amountConfirmed': 'Số tiền đã nhận', // REVIEW
  'details.recorded': 'Ghi lúc', // REVIEW
  'details.gone': 'Mục này không còn trong chuyến đi.', // REVIEW
  'details.backToTrip': 'Về chuyến đi', // REVIEW
  'status.approved': 'Đã duyệt', // REVIEW
  'who.guestTitle': 'Bạn tham gia với tư cách khách', // REVIEW
  'who.guestExpenses': 'Khoản chi bạn thêm cần một thành viên duyệt.', // REVIEW
  'who.guestBank': 'Thông tin ngân hàng của bạn cũng cần thành viên duyệt. Sau đó chỉ thành viên mới đổi được.', // REVIEW
  'signIn.zalo': 'Đăng nhập bằng Zalo', // REVIEW
  'signIn.googleInZalo': 'Đã dùng Google trước đây? Nhấn ⋯ → Mở bằng trình duyệt để đăng nhập Google, rồi liên kết Zalo trong menu tài khoản.', // REVIEW
  'guest.becomeMemberZalo': 'Đăng nhập bằng Zalo để trở thành thành viên', // REVIEW
  'who.guestSignInZalo': 'Đăng nhập bằng Zalo để dùng đầy đủ', // REVIEW
  'who.nameMatch': 'Có phải bạn là {name}? Đã chọn sẵn theo tên tài khoản của bạn.', // REVIEW
  'who.signInTitle': 'Đăng nhập', // REVIEW
  'who.guestSignIn': 'Đăng nhập bằng Google để dùng đầy đủ', // REVIEW
  'myBank.title': 'Thông tin ngân hàng của bạn', // REVIEW
  'myBank.none': 'Chưa có thông tin ngân hàng', // REVIEW
  'myBank.add': 'Thêm', // REVIEW
  'myBank.pending': 'Đang chờ thành viên duyệt', // REVIEW
  'myBank.change': 'Đổi', // REVIEW
  'myBank.locked': 'Chỉ thành viên mới đổi được', // REVIEW
  'myBank.namePending': 'Bạn có thể thêm sau khi thành viên duyệt tên của bạn.', // REVIEW
  'guestBank.title': 'Thông tin ngân hàng của {name}', // REVIEW
  'guestBank.pending': 'Đang chờ thành viên duyệt.', // REVIEW
  'guestBank.note': 'Thông tin bạn lưu được dùng ngay. Chỉ nhập thông tin do {name} đưa cho bạn.', // REVIEW
  'guestBank.consent': '{name} đã đồng ý chia sẻ thông tin này. Xem {link}', // REVIEW
  'guestBank.change': 'Đổi', // REVIEW
  'guestBank.delete': 'Xóa', // REVIEW
  'guestBank.deleteConfirm': 'Xóa thông tin ngân hàng của {name}? Sẽ không ai chuyển cho {name} bằng mã QR được cho đến khi có thông tin mới.', // REVIEW
  'guestBank.deleted': 'Đã xóa', // REVIEW
  'people.bank': 'Thông tin ngân hàng', // REVIEW
  'people.bankNone': 'Chưa có thông tin ngân hàng', // REVIEW
  'people.bankPending': 'Thông tin ngân hàng đang chờ duyệt', // REVIEW
  'people.bankWaitingSuffix': 'đang chờ duyệt', // REVIEW
  'transfers.addFor': 'Thêm thông tin ngân hàng cho {name}', // REVIEW
  'activity.bankSet': '{actor} đã lưu thông tin ngân hàng của {name}', // REVIEW
  'activity.bankRemoved': '{actor} đã xóa thông tin ngân hàng của {name}', // REVIEW
  'activity.action.bank_set': 'đã lưu thông tin ngân hàng', // REVIEW
  'activity.action.bank_removed': 'đã xóa thông tin ngân hàng', // REVIEW
  'payments.mine': 'Khoản đã trả của bạn', // REVIEW
  'payments.all': 'Tất cả khoản đã trả', // REVIEW
  'payments.emptyMine': 'Chưa có khoản đã trả nào liên quan đến bạn.', // REVIEW
  'payments.arrived': 'Đã nhận được', // REVIEW
  'expenses.mine': 'Khoản chi của bạn', // REVIEW
  'expenses.all': 'Tất cả khoản chi', // REVIEW
  'expenses.emptyMine': 'Chưa có khoản chi nào liên quan đến bạn.', // REVIEW
  'expense.youPaidTotal': 'Bạn đã trả {amount}', // REVIEW
  'expense.personPaidTotal': '{name} đã trả {amount}', // REVIEW
  'activity.paymentArrived': '{actor} cho biết đã nhận được một khoản thanh toán · {amount}', // REVIEW
  'activity.action.payment_arrived': 'cho biết đã nhận được một khoản thanh toán', // REVIEW
  'activity.adminPromoted': '{actor} đã chỉ định {name} làm quản trị viên nhóm', // REVIEW
  'activity.adminDemoted': '{actor} đã gỡ quyền quản trị của {name}', // REVIEW
  'activity.action.admin_promoted': 'đã chỉ định quản trị viên nhóm', // REVIEW
  'activity.action.admin_demoted': 'đã gỡ quyền quản trị viên nhóm', // REVIEW
  'activity.expenseRolledBack': '{actor} đã khôi phục "{description}"', // REVIEW
  'activity.action.expense_rolled_back': 'đã khôi phục một khoản chi', // REVIEW
  'people.removeAdmin': 'Gỡ quyền quản trị', // REVIEW

  'updates.bannerTitle': 'Có giao dịch liên quan đến bạn vừa được cập nhật', // REVIEW
  'updates.viewAll': 'Xem giao dịch cập nhật', // REVIEW
  'updates.previous': 'Trước đó', // REVIEW
  'updates.now': 'Hiện tại', // REVIEW
  'updates.dismiss': 'Đã hiểu', // REVIEW
  'auth.failed': 'Đăng nhập chưa xong — thử lại', // REVIEW
  'auth.linked': 'Đã liên kết {provider}', // REVIEW
  'auth.mergeRequested': 'Tài khoản {provider} này đã có tài khoản CoinCrew riêng. Đăng nhập vào tài khoản đó để xác nhận gộp (hết hạn sau 7 ngày).', // REVIEW
  'account.zaloAccount': 'Tài khoản Zalo', // REVIEW
  'error.lastIdentity': 'Liên kết thêm một cách đăng nhập trước.', // REVIEW
  'error.mergeStale': 'Yêu cầu gộp này không còn hiệu lực.', // REVIEW
  'account.methods': 'Cách đăng nhập', // REVIEW
  'account.methodsHint': 'Quản lý các tài khoản liên kết để đăng nhập và bảo mật', // REVIEW
  'account.whyLink': 'Vì sao nên liên kết?', // REVIEW
  'account.notLinked': 'Chưa liên kết', // REVIEW
  'account.linked': 'Đã liên kết', // REVIEW
  'account.link': 'Liên kết', // REVIEW
  'account.change': 'Đổi', // REVIEW
  'account.unlink': 'Gỡ', // REVIEW
  'account.unlinkConfirm': 'Gỡ {provider}? Bạn sẽ đăng nhập bằng cách còn lại.', // REVIEW
  'account.backupNudgeZalo': 'Liên kết thêm Google để không mất tài khoản khi đổi số Zalo', // REVIEW
  'account.backupNudgeGoogle': 'Liên kết thêm Zalo để đăng nhập ngay trong Zalo', // REVIEW
  'merge.cancel': 'Huỷ', // REVIEW
  'merge.chipPending': 'Chờ xác nhận', // REVIEW
  'merge.chipDeclined': 'Bị từ chối', // REVIEW
  'merge.chipAccepted': 'Đã gộp', // REVIEW
  'merge.rowLabel': '{provider}: {status}, {name}. Xem chi tiết', // REVIEW
  'merge.incoming': '{name} ({who}) muốn gộp tài khoản này vào tài khoản của họ', // REVIEW
  'merge.review': 'Xem & gộp', // REVIEW
  'merge.decline': 'Từ chối', // REVIEW
  'merge.confirmTitle': 'Gộp tài khoản?', // REVIEW
  'merge.moves': '{groups} nhóm, tài khoản ngân hàng và lịch sử của bạn sẽ chuyển sang tài khoản của {name}.', // REVIEW
  'merge.released': '{provider} {email} sẽ không còn đăng nhập vào đây', // REVIEW
  'merge.confirm': 'Gộp tài khoản', // REVIEW
  'merge.dot': 'Có yêu cầu gộp tài khoản', // REVIEW
  'merge.sheetTitle': 'Gộp với tài khoản {name}', // REVIEW
  'merge.sheetIntro': '{provider} này đã thuộc tài khoản CoinCrew {name}. Khi gộp, nhóm, ngân hàng và lịch sử của {name} sẽ chuyển sang tài khoản này.', // REVIEW
  'merge.step1': 'Bạn đã xác minh {provider} {label}', // REVIEW
  'merge.step2Pending': 'Xác nhận từ tài khoản {name}', // REVIEW
  'merge.step2Help': 'Đăng nhập bằng {provider} đó rồi chọn "Xem & gộp". Hết hạn {date}.', // REVIEW
  'merge.step2Declined': '{name} đã từ chối gộp', // REVIEW
  'merge.step2Accepted': '{name} đã đồng ý', // REVIEW
  'merge.step3': 'Hai tài khoản thành một', // REVIEW
  'merge.declinedHelp': 'Bạn có thể liên kết {provider} khác, hoặc thử lại nếu {name} đổi ý.', // REVIEW
  'merge.acceptedSummary': 'Nhóm, ngân hàng và lịch sử của {name} đã chuyển sang tài khoản này.', // REVIEW
  'merge.confirmHere': 'Đăng nhập {provider} để xác nhận', // REVIEW
  'merge.switchNote': 'Thiết bị này sẽ chuyển sang tài khoản {name}. Sau khi gộp, bạn quay lại tài khoản này với mọi thứ của cả hai.', // REVIEW
  'merge.cancelRequest': 'Huỷ yêu cầu', // REVIEW
  'merge.linkAgain': 'Liên kết lại', // REVIEW
  'merge.gotIt': 'Đã hiểu', // REVIEW
  'merge.noRequestHere': 'Tài khoản này không có yêu cầu gộp nào đang chờ.', // REVIEW
  'entry.tabs': 'Bạn đang thêm gì?', // REVIEW
  'entry.expense': 'Chi tiêu', // REVIEW
  'entry.income': 'Quỹ thu', // REVIEW
  'fund.title': 'Quỹ nhóm', // REVIEW
  'fund.pillLabel': 'Quỹ nhóm, {amount}', // REVIEW
  'fund.addTitle': 'Thêm vào quỹ', // REVIEW
  'fund.editTitle': 'Sửa khoản thu quỹ', // REVIEW
  'fund.add': 'Thêm vào quỹ', // REVIEW
  'fund.note': 'Ghi chú', // REVIEW
  'fund.notePlaceholder': 'VD: Thu 2 khách vãng lai', // REVIEW
  'fund.keepAtLeast': 'Giữ ít nhất {amount}: phần còn lại đã được chi.', // REVIEW
  'fund.payerOption': 'Quỹ nhóm · {amount}', // REVIEW
  'fund.paidTitle': 'Chi từ quỹ nhóm', // REVIEW
  'fund.noShares': 'Không ai phải góp.', // REVIEW
  'fund.after': 'Quỹ còn lại: {amount}', // REVIEW
  'fund.overLimit': 'Quỹ chỉ còn {amount}. Giảm số tiền hoặc chọn người trả.', // REVIEW
  'fund.rowIncome': 'Quỹ thu · {name} thêm', // REVIEW
  'fund.rowIncomeMe': 'Quỹ thu · bạn thêm', // REVIEW
  'fund.rowPaid': 'Chi từ quỹ nhóm', // REVIEW
  'fund.added': 'Đã thu', // REVIEW
  'fund.spent': 'Đã chi', // REVIEW
  'fund.keptBy': 'Quản trị viên giữ', // REVIEW
  'fund.adminsOnly': 'Chỉ quản trị viên được thêm hoặc chi tiền quỹ.', // REVIEW
  'fund.emptyTitle': 'Quỹ đang trống.', // REVIEW
  'fund.emptyBody': 'Tiền khách vãng lai hoặc tài trợ sẽ hiện ở đây.', // REVIEW
  'fund.addedBy': 'Người thêm', // REVIEW
  'fund.readOnly': 'Chỉ quản trị viên được sửa khoản thu quỹ.', // REVIEW
  'fund.cantDisable': 'Không thể tắt: {amount} trong khoản này đã được chi.', // REVIEW
  'fund.expenseNote': 'Không ai phải góp. Tiền được chi từ quỹ nhóm.', // REVIEW
  'details.income': 'Khoản thu quỹ', // REVIEW
  'error.fundShort': 'Quỹ nhóm không đủ cho khoản này. Kiểm tra quỹ rồi thử lại.', // REVIEW
  'activity.incomeAdded': '{actor} thêm {amount} vào quỹ · {description}', // REVIEW
  'activity.incomeEdited': '{actor} sửa khoản thu quỹ · {description} · {amount}', // REVIEW
  'activity.incomeDisabled': '{actor} tắt khoản thu quỹ · {description}', // REVIEW
  'activity.incomeEnabled': '{actor} bật khoản thu quỹ · {description}', // REVIEW
  'activity.incomeRolledBack': '{actor} khôi phục khoản thu quỹ · {description}', // REVIEW
  'activity.fundExpenseAdded': '{actor} chi {amount} từ quỹ · {description}', // REVIEW
  'activity.action.income_added': 'thêm tiền vào quỹ', // REVIEW
  'activity.action.income_edited': 'sửa khoản thu quỹ', // REVIEW
  'activity.action.income_disabled': 'tắt khoản thu quỹ', // REVIEW
  'activity.action.income_enabled': 'bật khoản thu quỹ', // REVIEW
  'activity.action.income_rolled_back': 'khôi phục khoản thu quỹ', // REVIEW
  'activity.ratingsEnabled': '{actor} đã bật đánh giá người chơi', // REVIEW
  'activity.ratingsDisabled': '{actor} đã tắt đánh giá người chơi', // REVIEW
  'activity.action.ratings_changed': 'đã thay đổi cài đặt đánh giá người chơi', // REVIEW
  'error.ratingLimit': 'Bạn đã chạm giới hạn sao. Hãy thu hồi sao trước rồi thử lại.', // REVIEW
  'ratings.title': 'Đánh giá người chơi', // REVIEW
  'ratings.leaderboard': 'Bảng xếp hạng', // REVIEW
  'ratings.quote': 'Đánh hết mình, chấm công tâm — mỗi sao đều quý', // REVIEW
  'ratings.rateAction': 'Chấm sao', // REVIEW
  'ratings.coldTitle': 'Chưa có đánh giá nào', // REVIEW
  'ratings.coldBody': 'Hãy là người đầu tiên chấm sao ẩn danh cho đồng đội để lập bảng xếp hạng CLB.', // REVIEW
  'ratings.coldCta': 'Nhấn vào đây để chấm sao', // REVIEW
  'ratings.budgetTitle': 'Ví sao của bạn', // REVIEW
  'ratings.budgetLeft': 'Còn {remaining} / {max} ★', // REVIEW
  'ratings.budgetHint': 'Ẩn danh 100% · Chạm ★ để tặng (tối đa {maxPerPlayer}★) · Giữ ★ để hóa mặt trời và nổ về 0', // REVIEW
  'ratings.overBudgetTitle': 'Vượt quỹ sao do giảm thành viên', // REVIEW
  'ratings.overBudgetHint': 'Bạn đã phát {spent} ★ (giới hạn mới: {max} ★). Hãy thu hồi ít nhất {over} ★ trước khi tặng thêm.', // REVIEW
  'ratings.totalStars': 'Tổng {count} ★', // REVIEW
  'ratings.yours': 'Bạn tặng: {count}/{max} ★', // REVIEW
  'ratings.youBadge': 'Bạn', // REVIEW
  'ratings.giveStar': 'Tặng 1 sao cho {name}', // REVIEW
  'ratings.takeStar': 'Thu hồi 1 sao từ {name}', // REVIEW
  'ratings.searchPlaceholder': 'Tìm trong {count} người chơi...', // REVIEW
  'ratings.searchLabel': 'Tìm người chơi', // REVIEW
  'ratings.noSearchMatch': 'Không tìm thấy người chơi "{query}".', // REVIEW
  'ratings.showAll': 'Hiện tất cả {count} người chơi', // REVIEW
  'ratings.guestTitle': 'Đăng nhập để chấm sao', // REVIEW
  'ratings.guestBody': 'Chỉ thành viên đã đăng nhập mới có quỹ sao để đánh giá ẩn danh.', // REVIEW
  'ratings.switchTitle': 'Đánh giá người chơi', // REVIEW
  'ratings.switchExplain': 'Cho phép thành viên ẩn danh tặng sao đánh giá kỹ năng và hiện bảng xếp hạng CLB.', // REVIEW
  'ratings.collapse': 'Thu gọn bảng xếp hạng', // REVIEW
  'ratings.expand': 'Mở rộng bảng xếp hạng', // REVIEW
};

