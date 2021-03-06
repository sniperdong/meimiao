/**
* Created by junhao on 2017/2/10.
*/
const async = require('async');
const request = require('../../lib/request');
const spiderUtils = require('../../lib/spiderUtils');

let logger;
class dealWith {
  constructor(spiderCore) {
    this.core = spiderCore;
    this.settings = spiderCore.settings;
    logger = this.settings.logger;
    logger.trace('DealWith instantiation ...');
  }
  todo(task, callback) {
    task.cNum = 0;      // 评论的数量
    task.lastId = 0;      // 第一页评论的第一个评论Id
    task.lastTime = 0;      // 第一页评论的第一个评论时间
    task.isEnd = false;  // 判断当前评论跟库里返回的评论是否一致
    task.addCount = 0;      // 新增的评论数
    this.totalPage(task, (err) => {
      if (err) {
        callback(err);
        return;
      }
      callback(null, task.cNum, task.lastId, task.lastTime, task.addCount);
    });
  }
  totalPage(task, callback) {
    const option = {
      url: `http://m.uczzd.cn/iflow/api/v2/cmt/article/${task.aid}/comments/byhot?count=10&fr=iphone&dn=11341561814-acaf3ab1&hotValue=-1`
    };
    let total = 0;
    request.get(logger, option, (err, result) => {
      if (err) {
        logger.debug('uc评论总量请求失败', err);
        callback(err);
        return;
      }
      try {
        result = JSON.parse(result.body);
      } catch (e) {
        logger.debug('uc评论数据解析失败');
        logger.info(result.body);
        callback(e);
        return;
      }
      task.cNum = result.data.comment_cnt;
      if ((task.cNum - task.commentNum) <= 0) {
        task.lastId = task.commentId;
        task.lastTime = task.commentTime;
        callback();
        return;
      }
      if (task.commentNum <= 0) {
        total = (task.cNum % 10) === 0 ? task.cNum / 10 : Math.ceil(task.cNum / 10);
      } else {
        total = (task.cNum - task.commentNum);
        total = (total % 10) === 0 ? total / 10 : Math.ceil(total / 10);
      }
      if (!result.data.comments || result.data.comments == '') {
        task.lastId = task.commentId;
        task.lastTime = task.commentTime;
        callback();
        return;
      }
      const comment = result.data.comments_map[result.data.comments[0]];
      task.lastTime = comment.time.toString().substring(0, 10);
      task.lastId = comment.id;
      task.addCount = task.cNum - task.commentNum;
      this.commentList(task, total, () => {
        callback();
      });
    });
  }
  commentList(task, total, callback) {
    const option = {};
    let page = 1,
      hotScore = -1,
      comments,
      length;
    async.whilst(
      () => page <= total,
      (cb) => {
        option.url = `http://m.uczzd.cn/iflow/api/v2/cmt/article/${task.aid}/comments/byhot?count=10&fr=iphone&dn=11341561814-acaf3ab1&hotValue=${hotScore}`;
        request.get(logger, option, (err, result) => {
          if (err) {
            logger.debug('uc评论列表请求失败', err);
            cb();
            return;
          }
          try {
            result = JSON.parse(result.body);
          } catch (e) {
            logger.debug('uc评论数据解析失败');
            logger.info(result);
            cb();
            return;
          }
          comments = result.data.comments;
          length = comments.length;
          if (length <= 0) {
            total = -1;
            cb();
            return;
          }
          this.deal(task, result.data, () => {
            if (task.isEnd) {
              callback();
              return;
            }
            page += 1;
            hotScore = result.data.comments_map[comments[length - 1]].hotScore;
            cb();
          });
        });
      },
      () => {
        callback();
      }
    );
  }
  deal(task, comments, callback) {
    const length = comments.comments.length;
    let index = 0,
      commentData,
      time,
      comment;
    async.whilst(
      () => index < length,
      (cb) => {
        commentData = comments.comments_map[comments.comments[index]];
        time = commentData.time.toString().substring(0, 10);
        if (task.commentId == commentData.commentId || task.commentTime >= time) {
          task.isEnd = true;
          callback();
          return;
        }
        comment = {
          cid: commentData.id,
          content: spiderUtils.stringHandling(commentData.content),
          platform: task.p,
          bid: task.bid,
          aid: task.aid,
          ctime: time,
          support: commentData.up_cnt,
          reply: commentData.reply_cnt,
          c_user: {
            uid: commentData.ucid_sign,
            uname: commentData.user.nickname,
            uavatar: commentData.user.faceimg
          }
        };
        spiderUtils.saveCache(this.core.cache_db, 'comment_cache', comment);
        index += 1;
        cb();
      },
      () => {
        callback();
      }
    );
  }

}

module.exports = dealWith;
