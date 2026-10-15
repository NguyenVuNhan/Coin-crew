import type { MessageKey } from './en';

export const vi: Record<MessageKey, string> = {
  'common.retry': 'Thử lại', // REVIEW
  'common.cancel': 'Hủy', // REVIEW
  'common.save': 'Lưu', // REVIEW
  'common.continue': 'Tiếp tục', // REVIEW
  'common.back': 'Quay lại', // REVIEW
  'common.close': 'Đóng', // REVIEW
  'common.loading': 'Đang tải…', // REVIEW

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
  'who.someoneNew': 'Tôi là người mới', // REVIEW
  'who.areYou': 'Bạn là {name} phải không?', // REVIEW
  'who.yesIm': 'Đúng, tôi là {name}', // REVIEW
  'who.noAddMe': 'Không, thêm tôi vào', // REVIEW

  'expenses.empty': 'Chưa có khoản chi nào. Hãy thêm khoản đầu tiên.', // REVIEW
  'expenses.disabledBy': 'Đã bị vô hiệu hóa bởi {name}', // REVIEW
  'expense.sendForApproval': 'Gửi để duyệt', // REVIEW

  'approvals.paidYou': '{name} báo đã chuyển khoản cho bạn {amount}', // REVIEW
  'approvals.didItArrive': 'Bạn đã nhận được tiền chưa?', // REVIEW

  'pay.payWithVietQr': 'Thanh toán bằng VietQR', // REVIEW
  'pay.keepNote': 'Giữ nguyên nội dung chuyển khoản này để đối soát thanh toán.', // REVIEW
  'pay.bankPending': 'Thông tin ngân hàng của {name} đang chờ duyệt', // REVIEW
  'pay.bankNone': '{name} chưa thêm thông tin ngân hàng', // REVIEW
  'pay.waiting': 'Đang chờ {name} nhận được tiền. Trang này sẽ tự động cập nhật.', // REVIEW
  'pay.alreadyPaid': 'Tôi đã chuyển tiền rồi', // REVIEW
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

  'trips.title': 'Chuyến đi của bạn', // REVIEW
  'trips.new': 'Chuyến đi mới', // REVIEW
  'trips.emptyTitle': 'Lên kế hoạch cho chuyến đi đầu tiên', // REVIEW
  'trips.emptyBody': 'Tạo chuyến đi, rồi chia sẻ một liên kết cho cả nhóm.', // REVIEW
  'trips.youreOwed': 'Bạn được nhận', // REVIEW
  'trips.youOwe': 'Bạn cần trả', // REVIEW
  'trips.settled': 'Đã thanh toán xong', // REVIEW
  'trips.archived': 'đã lưu trữ', // REVIEW

  'account.label': 'Tài khoản', // REVIEW
  'account.language': 'Ngôn ngữ', // REVIEW
  'account.signOut': 'Đăng xuất', // REVIEW

  'create.title': 'Chuyến đi mới', // REVIEW
  'create.tripName': 'Tên chuyến đi', // REVIEW
  'create.tripNamePlaceholder': 'Đà Lạt · Th10 2026', // REVIEW
  'create.myName': 'Tên của bạn', // REVIEW
  'create.others': 'Ai sẽ tham gia cùng?', // REVIEW
  'create.otherPlaceholder': 'Tên', // REVIEW
  'create.addPerson': 'Thêm người', // REVIEW
  'create.removePerson': 'Xóa {name}', // REVIEW
  'create.bankTitle': 'Thông tin ngân hàng của bạn (không bắt buộc)', // REVIEW
  'create.bankHint': 'Để bạn bè có thể chuyển khoản trả bạn qua VietQR. Bạn có thể thêm sau.', // REVIEW
  'create.submit': 'Tạo chuyến đi', // REVIEW

  'bank.bank': 'Ngân hàng', // REVIEW
  'bank.popular': 'Phổ biến', // REVIEW
  'bank.allBanks': 'Tất cả ngân hàng', // REVIEW
  'bank.choose': 'Chọn ngân hàng', // REVIEW
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
  'who.memberHint': 'Đã đăng nhập — chạm để đăng nhập với tên {name}', // REVIEW
  'who.pending': 'Đang chờ duyệt', // REVIEW
  'who.notOnList': 'Không có tên trong danh sách?', // REVIEW
  'who.newTitle': 'Tên của bạn là gì?', // REVIEW
  'who.newHint': 'Dùng tên mà bạn bè hay gọi bạn.', // REVIEW
  'who.nameLabel': 'Tên của bạn', // REVIEW
  'who.inTrip': 'Đã có trong chuyến đi này', // REVIEW
  'who.similar': '"{typed}" có vẻ giống "{name}", người đã có trong chuyến đi này.', // REVIEW
  'who.newPendingNote': 'Một thành viên sẽ kiểm tra tên mới trước khi xuất hiện trong chuyến đi.', // REVIEW

  'guest.viewingAs': 'Đang xem với tư cách {name}', // REVIEW
  'guest.switch': 'Không phải {name}? Đổi tên', // REVIEW
  'guest.youOwe': 'Bạn cần trả {name}', // REVIEW
  'guest.youreOwed': 'Bạn được nhận', // REVIEW
  'guest.settled': 'Bạn đã thanh toán hết', // REVIEW
  'guest.dropsTo': 'Giảm xuống {amount} nếu các khoản chi của bạn được duyệt', // REVIEW
  'guest.yourShare': 'Cách tính phần của bạn', // REVIEW
  'guest.yourTotal': 'Tổng của bạn', // REVIEW
  'guest.becomeMember': 'Đăng nhập bằng Google để trở thành thành viên', // REVIEW
  'guest.memberRequested': 'Bạn đã yêu cầu trở thành thành viên. Một thành viên sẽ duyệt yêu cầu này.', // REVIEW

  'trip.total': 'Tổng chuyến đi {amount}', // REVIEW
  'trip.people': '{n} người', // REVIEW
  'trip.balances': 'Số dư', // REVIEW
  'trip.whoPaysWhom': 'Ai trả ai', // REVIEW
  'trip.expenses': 'Khoản chi', // REVIEW
  'trip.addExpense': '+ Thêm khoản chi', // REVIEW
  'trip.pays': '{from} → {to}', // REVIEW
  'trip.viewOnly': 'Chỉ xem', // REVIEW
  'trip.you': 'Bạn', // REVIEW
  'trip.allSettled': 'Mọi người đã thanh toán hết.', // REVIEW
  'trip.waitingConfirm': '{amount} đang chờ {name} xác nhận', // REVIEW

  'expense.youPaid': 'Bạn đã trả', // REVIEW
  'expense.personPaid': '{name} đã trả', // REVIEW
  'split.equal': 'chia đều, {n}', // REVIEW
  'split.amounts': 'số tiền chính xác', // REVIEW
  'split.percent': 'theo phần trăm', // REVIEW
  'split.shares': 'theo phần chia', // REVIEW
  'split.adjust': 'có điều chỉnh', // REVIEW
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
  'split.tab.amounts': 'Số tiền', // REVIEW
  'split.tab.percent': '%', // REVIEW
  'split.tab.shares': 'Số phần', // REVIEW
  'split.tab.adjust': '± Điều chỉnh', // REVIEW
  'splitError.NO_PARTICIPANTS': 'Chọn ít nhất một người.', // REVIEW
  'splitError.INVALID_AMOUNT': 'Nhập số tiền trước.', // REVIEW
  'splitError.AMOUNTS_DONT_ADD_UP': 'Tổng số tiền không khớp với tổng chi phí.', // REVIEW
  'splitError.PERCENT_NOT_100': 'Tổng phần trăm phải bằng 100%.', // REVIEW
  'splitError.SHARES_NOT_POSITIVE': 'Mỗi phần chia phải lớn hơn 0.', // REVIEW
  'splitError.NEGATIVE_SHARE': 'Khoản điều chỉnh lớn hơn tổng số tiền.', // REVIEW

  'member.settings': 'Cài đặt chuyến đi', // REVIEW

  'balance.owed': 'Bạn được nhận', // REVIEW
  'balance.owe': 'Bạn cần trả', // REVIEW
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
  'approvals.name': 'Người mới: {name}', // REVIEW
  'approvals.looksLike': 'Có vẻ giống {name}, người đã có trong nhóm', // REVIEW
  'approvals.sameAs': 'Là {name}', // REVIEW
  'approvals.newPerson': 'Người mới', // REVIEW
  'approvals.bank': '{name} đã thêm thông tin ngân hàng', // REVIEW
  'approvals.confirm': 'Xác nhận', // REVIEW
  'approvals.didntArrive': 'Chưa nhận được', // REVIEW
  'approvals.amountReceived': 'Số tiền nhận được', // REVIEW
  'approvals.notArrived': '{name} báo chưa nhận được {amount} từ {payer}', // REVIEW
  'approvals.disable': 'Vô hiệu hóa', // REVIEW
  'approvals.keep': 'Giữ lại', // REVIEW
  'approvals.membership': '{user} ({email}) muốn tham gia với tên {name}', // REVIEW
  'approvals.approveNameFirst': 'Duyệt {name} trước', // REVIEW

  'whoPays.pay': 'Thanh toán', // REVIEW
  'whoPays.remind': 'Nhắc', // REVIEW
  'whoPays.remindCopied': 'Đã sao chép lời nhắc — dán vào nhóm chat.', // REVIEW
  'whoPays.paid': 'Đã trả ✓', // REVIEW
  'whoPays.waiting': 'Đang chờ', // REVIEW
  'whoPays.received': 'Đã nhận', // REVIEW
  'payments.title': 'Các khoản đã trả', // REVIEW
  'payments.disable': 'Tắt', // REVIEW
  'payments.enable': 'Bật lại', // REVIEW
  'payments.didntArrive': 'Chưa nhận được', // REVIEW
  'payments.reported': 'Đã báo. Một thành viên sẽ kiểm tra.', // REVIEW
  'payments.notArrivedPill': 'Chưa nhận được', // REVIEW
  'guest.paysYou': 'Ai trả cho bạn', // REVIEW
  'remind.text': 'Chào {name}! Bạn còn {amount} cần trả {creditor} cho chuyến "{trip}". Xem chi tiết và chuyển khoản bằng VietQR: {link}', // REVIEW

  'expenses.disable': 'Vô hiệu hóa', // REVIEW
  'expenses.enable': 'Kích hoạt lại', // REVIEW

  'share.groupLink': 'Liên kết nhóm', // REVIEW
  'share.groupHint': 'Gửi vào nhóm chat của bạn. Bạn bè chọn tên của mình — không cần tài khoản.', // REVIEW
  'share.viewLink': 'Liên kết chỉ xem', // REVIEW
  'share.viewHint': 'Những người có liên kết này có thể xem nhưng không thể thay đổi.', // REVIEW
  'share.copy': 'Sao chép', // REVIEW
  'share.copied': 'Đã sao chép', // REVIEW
  'share.regenerate': 'Tạo liên kết mới', // REVIEW
  'share.regenerateConfirm': 'Liên kết cũ sẽ ngừng hoạt động. Tạo liên kết mới?', // REVIEW

  'settings.title': 'Cài đặt chuyến đi', // REVIEW
  'settings.people': 'Thành viên', // REVIEW
  'settings.activity': 'Hoạt động', // REVIEW
  'settings.archive': 'Lưu trữ chuyến đi', // REVIEW
  'settings.archiveConfirm': 'Không ai có thể thay đổi chuyến đi này sau khi lưu trữ. Lưu trữ?', // REVIEW
  'settings.archived': 'Chuyến đi này đã được lưu trữ. Bạn vẫn có thể xem.', // REVIEW

  'people.title': 'Thành viên', // REVIEW
  'people.organiser': 'Trưởng nhóm', // REVIEW
  'people.member': 'Thành viên', // REVIEW
  'people.guest': 'Khách', // REVIEW
  'people.merge': 'Hợp nhất', // REVIEW
  'people.mergeInto': 'Hợp nhất {name} vào…', // REVIEW
  'people.mergeConfirm': 'Chuyển toàn bộ khoản chi và thanh toán từ {from} sang {into}?', // REVIEW
  'people.mergeExplain': 'Hợp nhất sẽ chuyển mọi khoản chi và thanh toán từ tên này sang tên khác, xử lý các trường hợp trùng lặp.', // REVIEW
  'people.remove': 'Xóa', // REVIEW
  'people.useMerge': 'Dùng hợp nhất thay thế', // REVIEW

  'activity.title': 'Hoạt động', // REVIEW
  'activity.empty': 'Chưa có hoạt động nào.', // REVIEW
  'activity.someone': 'Ai đó', // REVIEW
  'activity.line': '{actor} {action}', // REVIEW
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
  'activity.action.fewest_changed': 'đã thay đổi cài đặt ít lần chuyển khoản nhất', // REVIEW
  'activity.action.membership_requested': 'đã yêu cầu trở thành thành viên', // REVIEW
  'activity.action.membership_approved': 'đã duyệt thành viên mới', // REVIEW
  'activity.action.membership_rejected': 'đã từ chối thành viên mới', // REVIEW

  'pay.title': 'Thanh toán cho {name}', // REVIEW
  'pay.bank': 'Ngân hàng', // REVIEW
  'pay.account': 'Số tài khoản', // REVIEW
  'pay.name': 'Tên chủ tài khoản', // REVIEW
  'pay.amount': 'Số tiền', // REVIEW
  'pay.note': 'Nội dung chuyển khoản', // REVIEW
  'pay.copyAccount': 'Sao chép số tài khoản', // REVIEW
  'pay.copyNote': 'Sao chép nội dung', // REVIEW
  'pay.copied': 'Đã sao chép', // REVIEW
  'pay.scanHint': 'Quét bằng bất kỳ ứng dụng ngân hàng Việt Nam nào, hoặc lưu mã QR và chọn từ thư viện ảnh.', // REVIEW
  'pay.qrAlt': 'Mã VietQR thanh toán cho {name} {amount}', // REVIEW
  'pay.tapToCheck': 'Chạm để kiểm tra lại', // REVIEW
  'pay.waitingConfirm': 'Đang chờ {name} xác nhận', // REVIEW
  'pay.paid': 'Đã thanh toán ✓', // REVIEW
  'pay.nothingOwed': 'Hiện tại bạn không nợ {name} khoản nào.', // REVIEW
  'pay.chooseApp': 'Chọn ứng dụng ngân hàng của bạn', // REVIEW
  'pay.fillsIn': 'tự động điền thông tin thanh toán', // REVIEW
  'pay.remindThem': 'Nhắc {name}', // REVIEW
  'pay.remindBankText': 'Chào {name}! Nhớ thêm thông tin ngân hàng trong "{trip}" để mình chuyển khoản trả bạn qua VietQR nhé: {link}', // REVIEW

  'bankForm.title': 'Thông tin ngân hàng của bạn', // REVIEW
  'bankForm.guestNote': 'Một thành viên sẽ duyệt thông tin ngân hàng mới trước khi người khác có thể chuyển khoản cho bạn.', // REVIEW
  'bankForm.memberNote': 'Đã lưu vào hồ sơ của bạn và được dùng trong tất cả chuyến đi.', // REVIEW
  'bankForm.save': 'Lưu thông tin ngân hàng', // REVIEW
  'bankForm.saved': 'Đã lưu', // REVIEW
  'bankForm.pending': 'Đang chờ một thành viên duyệt thông tin ngân hàng của bạn.', // REVIEW
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
};

