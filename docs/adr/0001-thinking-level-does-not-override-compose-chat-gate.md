# Thinking level 不接管 compose/chat 开关

新增的手动 Thinking level(低/中/高/极高)只决定 compose 意图下思考多深,不改变 classifyIntent 判定 chat 意图时完全跳过思考、不展示思考链的现状。

考虑过让手动选择完全接管(用户选了强度就该按强度思考,不再区分 chat/compose),但会让每一句简单问答都先走一段思考链,牺牲现有的低延迟"直答"体验,而这部分体验没有人抱怨过、也不是本次要解决的问题。
